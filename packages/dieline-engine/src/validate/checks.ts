import { area, outlineArea } from "../primitives/polygon";
import { flattenOutline } from "../primitives/arc";
import { panelOutline } from "../fold-tree/extract";
import { dist } from "../primitives/vec2";
import type { Bounds } from "../primitives/polygon";
import type { Vec2 } from "../primitives/vec2";
import type { ExtractedLines } from "../fold-tree/extract";
import type { FoldTree } from "../fold-tree/types";
import type { CheckResult } from "../geometry-types";
import { effectiveDims, sheetOrigin, type TuckEndParams } from "../templates/tuck-end-params";
import { PRINTED_NORMAL, type Vec3, flatPoint, foldTree, transformDirection, transformPoint } from "../fold-tree/fold3d";

interface CheckInput {
  readonly params: TuckEndParams;
  readonly tree: FoldTree;
  readonly lines: ExtractedLines;
  readonly bleedLoop: readonly Vec2[];
  readonly bleedPieces: number;
  readonly cutBounds: Bounds;
  readonly bleedBounds: Bounds;
}

/**
 * Independent invariants. Expected values come from closed-form formulas,
 * NOT from the geometry builder, so a builder bug cannot hide itself.
 */
export function runChecks(input: CheckInput): CheckResult[] {
  const { params: p, tree, lines, bleedLoop, bleedPieces, cutBounds, bleedBounds } = input;
  const { L, W, H } = effectiveDims(p);
  const g = p.glueFlapWidth;
  const t = p.tuckDepth;
  const d = p.dustFlapDepth;
  const results: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail });
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

  check("single-cut-loop", lines.cutLoops.length === 1, `${lines.cutLoops.length} cut loop(s)`);

  const outer = lines.cutLoops[0];
  const panelArea = tree.panels.reduce((s, pa) => s + outlineArea(panelOutline(pa)), 0);
  if (outer) {
    const outerArea = outlineArea(outer);
    check(
      "panels-fill-outline",
      near(panelArea, outerArea, 1e-6 * Math.max(1, outerArea)),
      `sum of panel areas ${panelArea.toFixed(4)} vs outline area ${outerArea.toFixed(4)} mm2`,
    );
  } else {
    check("panels-fill-outline", false, "no outline");
  }

  const sheetW = cutBounds.max.x - cutBounds.min.x;
  const sheetH = cutBounds.max.y - cutBounds.min.y;
  const expW = g + 2 * L + 2 * W;
  const expH = H + 2 * Math.max(W + t, d);
  check("sheet-width", near(sheetW, expW), `${sheetW.toFixed(4)} vs expected ${expW.toFixed(4)} mm`);
  check("sheet-height", near(sheetH, expH), `${sheetH.toFixed(4)} vs expected ${expH.toFixed(4)} mm`);

  const creaseTotal = lines.creaseLines.reduce((s, c) => s + dist(c.a, c.b), 0);
  // Tuck creases are shortened by a slit at each end.
  const expCrease = 4 * H + 2 * L + 2 * (L - 2 * p.tuckSlitLength) + 4 * W;
  check("total-crease-length", near(creaseTotal, expCrease), `${creaseTotal.toFixed(4)} vs expected ${expCrease.toFixed(4)} mm`);

  check(
    "tree-connected",
    tree.hinges.length === tree.panels.length - 1,
    `${tree.hinges.length} hinges for ${tree.panels.length} panels`,
  );

  check("bleed-single-loop", bleedPieces === 1, `${bleedPieces} bleed polygon(s)`);
  if (p.bleed > 0 && outer) {
    check("bleed-grows-outline", area(bleedLoop) > outlineArea(outer), "bleed area larger than cut area");
    const tol = 1e-3;
    const okBounds =
      near(bleedBounds.min.x, cutBounds.min.x - p.bleed, tol) &&
      near(bleedBounds.min.y, cutBounds.min.y - p.bleed, tol) &&
      near(bleedBounds.max.x, cutBounds.max.x + p.bleed, tol) &&
      near(bleedBounds.max.y, cutBounds.max.y + p.bleed, tol);
    check("bleed-bounds", okBounds, `bleed bounds are cut bounds expanded by ${p.bleed} mm`);
  }

  results.push(...foldedChecks(p, tree));
  return results;
}

const near3 = (a: Vec3, b: Vec3, tol = 1e-6) =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
const sameSegment = (a1: Vec3, a2: Vec3, b1: Vec3, b2: Vec3) =>
  (near3(a1, b1) && near3(a2, b2)) || (near3(a1, b2) && near3(a2, b1));
const fmt3 = (v: Vec3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

/**
 * Fold the carton fully closed and check it forms the intended box. Expected
 * positions come from L, W, H and the sheet origin, not from the fold result.
 */
function foldedChecks(p: TuckEndParams, tree: FoldTree): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });
  const { L, W, H } = effectiveDims(p);
  const o = sheetOrigin(p);
  let world: Map<string, readonly number[]>;
  try {
    world = foldTree(tree);
  } catch (e) {
    check("fold-tree-folds", false, (e as Error).message);
    return out;
  }
  const M = (id: string) => world.get(id)!;
  const hingeOf = (child: string) => tree.hinges.find((h) => h.childId === child)!;

  // 1. Closed box occupies exactly L x H x W (flaps all end up inside).
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const panel of tree.panels) {
    for (const v of flattenOutline(panelOutline(panel))) {
      const q = transformPoint(M(panel.id), flatPoint(v));
      min = { x: Math.min(min.x, q.x), y: Math.min(min.y, q.y), z: Math.min(min.z, q.z) };
      max = { x: Math.max(max.x, q.x), y: Math.max(max.y, q.y), z: Math.max(max.z, q.z) };
    }
  }
  const expMin = { x: o.x, y: o.y, z: 0 };
  const expMax = { x: o.x + L, y: o.y + H, z: W };
  check(
    "folded-box-size",
    near3(min, expMin) && near3(max, expMax),
    `folded bounds ${fmt3(min)}-${fmt3(max)} vs expected ${fmt3(expMin)}-${fmt3(expMax)}`,
  );

  // 2. Side seam closes: free edge of the last side panel meets the front's glue edge.
  const seamFlatX = o.x + 2 * L + 2 * W;
  const s1 = transformPoint(M("left"), { x: seamFlatX, y: o.y, z: 0 });
  const s2 = transformPoint(M("left"), { x: seamFlatX, y: o.y + H, z: 0 });
  check(
    "folded-seam-closes",
    sameSegment(s1, s2, { x: o.x, y: o.y, z: 0 }, { x: o.x, y: o.y + H, z: 0 }),
    `left panel free edge at ${fmt3(s1)}-${fmt3(s2)}`,
  );

  // 3. Each closure's far edge lands on the top/bottom edge of the opposite panel.
  const lid = (closureId: string, y: number, oppositeZ: number) => {
    const h = hingeOf(closureId);
    const panel = tree.panels.find((x) => x.id === closureId)!;
    const hx = h.b.x - h.a.x;
    const hy = h.b.y - h.a.y;
    const hl = Math.hypot(hx, hy);
    const far = panel.polygon
      .filter((v) => Math.abs((hx * (v.y - h.a.y) - hy * (v.x - h.a.x)) / hl) > 1e-6)
      .map((v) => transformPoint(M(closureId), flatPoint(v)));
    const xs = far.map((q) => q.x);
    const ok =
      far.length >= 2 &&
      far.every((q) => Math.abs(q.y - y) <= 1e-6 && Math.abs(q.z - oppositeZ) <= 1e-6) &&
      Math.abs(Math.min(...xs) - o.x) <= 1e-6 &&
      Math.abs(Math.max(...xs) - (o.x + L)) <= 1e-6;
    check(`folded-${closureId}-closes`, ok, `far edge at ${far.map(fmt3).join(", ")}`);
  };
  const opposite = (host: string) => (host === "back" ? 0 : W);
  lid("top-closure", o.y, opposite(hingeOf("top-closure").parentId));
  lid("bottom-closure", o.y + H, opposite(hingeOf("bottom-closure").parentId));

  // 4. Print faces outward on every outer panel (body + closures).
  const centre = { x: o.x + L / 2, y: o.y + H / 2, z: W / 2 };
  const inward = tree.panels
    .filter((pa) => pa.role === "body" || pa.role === "closure")
    .filter((pa) => {
      const n = transformDirection(M(pa.id), PRINTED_NORMAL);
      const c = pa.polygon.reduce<Vec3>((acc, v) => {
        const q = transformPoint(M(pa.id), flatPoint(v));
        return { x: acc.x + q.x / pa.polygon.length, y: acc.y + q.y / pa.polygon.length, z: acc.z + q.z / pa.polygon.length };
      }, { x: 0, y: 0, z: 0 });
      return n.x * (c.x - centre.x) + n.y * (c.y - centre.y) + n.z * (c.z - centre.z) <= 0;
    })
    .map((pa) => pa.id);
  check("folded-print-outside", inward.length === 0, inward.length ? `printed side faces inward on: ${inward.join(", ")}` : "all outer panels print outward");
  return out;
}
