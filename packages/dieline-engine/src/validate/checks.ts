import { area, outlineArea } from "../primitives/polygon";
import { flattenOutline } from "../primitives/arc";
import { panelOutline } from "../fold-tree/extract";
import { dist } from "../primitives/vec2";
import type { Bounds } from "../primitives/polygon";
import type { Vec2 } from "../primitives/vec2";
import type { ExtractedLines } from "../fold-tree/extract";
import type { FoldTree, PanelRole } from "../fold-tree/types";
import type { CheckResult } from "../geometry-types";
import { PRINTED_NORMAL, type Vec3, flatPoint, foldTree, transformDirection, transformPoint } from "../fold-tree/fold3d";

/**
 * Closed-form expectations a template computes from its parameters, NOT from
 * the geometry builder, so a builder bug cannot hide itself.
 */
export interface CartonExpectations {
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly creaseLength: number;
  /** Bounds of the fully closed carton (flat-sheet frame, z toward the inside). */
  readonly box: { readonly min: Vec3; readonly max: Vec3 };
  /** Free edge (flat a-b) of `panelId` must land on `target` when closed. */
  readonly seam?: { readonly panelId: string; readonly flatA: Vec2; readonly flatB: Vec2; readonly target: readonly [Vec3, Vec3] };
  /** Closure panels whose far edge must land at (y, z) spanning xMin..xMax when closed. */
  readonly lids: readonly { readonly closureId: string; readonly y: number; readonly z: number; readonly xMin: number; readonly xMax: number }[];
  /** Roles whose printed side must face out of the closed carton. */
  readonly outwardRoles: readonly PanelRole[];
}

export interface CheckInput {
  readonly tree: FoldTree;
  readonly lines: ExtractedLines;
  readonly bleed: number;
  readonly bleedLoop: readonly Vec2[];
  readonly bleedPieces: number;
  readonly cutBounds: Bounds;
  readonly bleedBounds: Bounds;
  readonly expect: CartonExpectations;
  readonly extraChecks?: (world: Map<string, readonly number[]>) => CheckResult[];
}

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

/** Independent invariants on the flat sheet and the folded carton. */
export function runChecks(input: CheckInput): CheckResult[] {
  const { tree, lines, bleed, bleedLoop, bleedPieces, cutBounds, bleedBounds, expect } = input;
  const results: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail });

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
  check("sheet-width", near(sheetW, expect.sheetWidth), `${sheetW.toFixed(4)} vs expected ${expect.sheetWidth.toFixed(4)} mm`);
  check("sheet-height", near(sheetH, expect.sheetHeight), `${sheetH.toFixed(4)} vs expected ${expect.sheetHeight.toFixed(4)} mm`);

  const creaseTotal = lines.creaseLines.reduce((s, c) => s + dist(c.a, c.b), 0);
  check(
    "total-crease-length",
    near(creaseTotal, expect.creaseLength),
    `${creaseTotal.toFixed(4)} vs expected ${expect.creaseLength.toFixed(4)} mm`,
  );

  check(
    "tree-connected",
    tree.hinges.length === tree.panels.length - 1,
    `${tree.hinges.length} hinges for ${tree.panels.length} panels`,
  );

  check("bleed-single-loop", bleedPieces === 1, `${bleedPieces} bleed polygon(s)`);
  if (bleed > 0 && outer) {
    check("bleed-grows-outline", area(bleedLoop) > outlineArea(outer), "bleed area larger than cut area");
    const tol = 1e-3;
    const okBounds =
      near(bleedBounds.min.x, cutBounds.min.x - bleed, tol) &&
      near(bleedBounds.min.y, cutBounds.min.y - bleed, tol) &&
      near(bleedBounds.max.x, cutBounds.max.x + bleed, tol) &&
      near(bleedBounds.max.y, cutBounds.max.y + bleed, tol);
    check("bleed-bounds", okBounds, `bleed bounds are cut bounds expanded by ${bleed} mm`);
  }

  results.push(...foldedChecks(input));
  return results;
}

const near3 = (a: Vec3, b: Vec3, tol = 1e-6) =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
const sameSegment = (a1: Vec3, a2: Vec3, b1: Vec3, b2: Vec3) =>
  (near3(a1, b1) && near3(a2, b2)) || (near3(a1, b2) && near3(a2, b1));
export const fmt3 = (v: Vec3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

/** Fold the carton fully closed and check it forms the intended box. */
function foldedChecks({ tree, expect, extraChecks }: CheckInput): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });
  let world: Map<string, readonly number[]>;
  try {
    world = foldTree(tree);
  } catch (e) {
    check("fold-tree-folds", false, (e as Error).message);
    return out;
  }
  const M = (id: string) => world.get(id)!;
  const hingeOf = (child: string) => tree.hinges.find((h) => h.childId === child);

  // 1. Closed box occupies exactly the expected volume (flaps all end up inside).
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const panel of tree.panels) {
    for (const v of flattenOutline(panelOutline(panel))) {
      const q = transformPoint(M(panel.id), flatPoint(v));
      min = { x: Math.min(min.x, q.x), y: Math.min(min.y, q.y), z: Math.min(min.z, q.z) };
      max = { x: Math.max(max.x, q.x), y: Math.max(max.y, q.y), z: Math.max(max.z, q.z) };
    }
  }
  check(
    "folded-box-size",
    near3(min, expect.box.min) && near3(max, expect.box.max),
    `folded bounds ${fmt3(min)}-${fmt3(max)} vs expected ${fmt3(expect.box.min)}-${fmt3(expect.box.max)}`,
  );

  // 2. Side seam closes.
  if (expect.seam) {
    const { panelId, flatA, flatB, target } = expect.seam;
    const s1 = transformPoint(M(panelId), flatPoint(flatA));
    const s2 = transformPoint(M(panelId), flatPoint(flatB));
    check("folded-seam-closes", sameSegment(s1, s2, target[0], target[1]), `${panelId} panel free edge at ${fmt3(s1)}-${fmt3(s2)}`);
  }

  // 3. Each closure's far edge lands where expected.
  for (const lid of expect.lids) {
    const h = hingeOf(lid.closureId);
    const panel = tree.panels.find((x) => x.id === lid.closureId);
    if (!h || !panel) {
      check(`folded-${lid.closureId}-closes`, false, "closure panel or hinge missing");
      continue;
    }
    const hx = h.b.x - h.a.x;
    const hy = h.b.y - h.a.y;
    const hl = Math.hypot(hx, hy);
    const far = panel.polygon
      .filter((v) => Math.abs((hx * (v.y - h.a.y) - hy * (v.x - h.a.x)) / hl) > 1e-6)
      .map((v) => transformPoint(M(lid.closureId), flatPoint(v)));
    const xs = far.map((q) => q.x);
    const ok =
      far.length >= 2 &&
      far.every((q) => near(q.y, lid.y) && near(q.z, lid.z)) &&
      near(Math.min(...xs), lid.xMin) &&
      near(Math.max(...xs), lid.xMax);
    check(`folded-${lid.closureId}-closes`, ok, `far edge at ${far.map(fmt3).join(", ")}`);
  }

  // 4. Print faces outward on every outer panel.
  const { min: bmin, max: bmax } = expect.box;
  const centre = { x: (bmin.x + bmax.x) / 2, y: (bmin.y + bmax.y) / 2, z: (bmin.z + bmax.z) / 2 };
  const inward = tree.panels
    .filter((pa) => expect.outwardRoles.includes(pa.role))
    .filter((pa) => {
      const n = transformDirection(M(pa.id), PRINTED_NORMAL);
      const c = foldedCentroid(pa.polygon, M(pa.id));
      return n.x * (c.x - centre.x) + n.y * (c.y - centre.y) + n.z * (c.z - centre.z) <= 0;
    })
    .map((pa) => pa.id);
  check("folded-print-outside", inward.length === 0, inward.length ? `printed side faces inward on: ${inward.join(", ")}` : "all outer panels print outward");

  if (extraChecks) out.push(...extraChecks(world));
  return out;
}

/** Vertex centroid of a panel after folding. */
export function foldedCentroid(polygon: readonly Vec2[], m: readonly number[]): Vec3 {
  const k = polygon.length;
  return polygon.reduce<Vec3>((acc, v) => {
    const q = transformPoint(m, flatPoint(v));
    return { x: acc.x + q.x / k, y: acc.y + q.y / k, z: acc.z + q.z / k };
  }, { x: 0, y: 0, z: 0 });
}
