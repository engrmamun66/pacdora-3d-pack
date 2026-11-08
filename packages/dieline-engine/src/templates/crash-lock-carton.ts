import type { FoldTree } from "../fold-tree/types";
import type { CheckResult, DielineGeometry } from "../geometry-types";
import { flatPoint, transformPoint } from "../fold-tree/fold3d";
import { area, intersectionArea, unionArea } from "../primitives/polygon";
import { type Vec2, vec } from "../primitives/vec2";
import { CartonBuilder, effectiveDims, finalizeCarton, poly, sheetOrigin, tubeExpectations } from "./carton-common";
import { type CrashLockParams, resolveCrashLockParams } from "./crash-lock-params";

export const CRASH_LOCK_TEMPLATE_ID = "crash-lock-carton";

/** The two glued bottom halves: outer flap on a wide panel, lock flap on the next (side) panel. */
const HALVES = [
  { major: "front", minor: "right" },
  { major: "back", minor: "left" },
] as const;

/**
 * Crash-lock bottom (own construction, from first principles):
 *
 * - Front and back panels each carry a bottom flap W/2 deep. A 45 degree crease
 *   from the hinge corner next to the side panel splits off a triangular glue
 *   tab (legs W/2).
 * - Each side panel carries a lock flap W/2 deep. Its edge next to the tab is
 *   a cut (slit) on the continuation of the body crease.
 * - The tab folds 180 degrees onto its own flap and is glued to the lock flap.
 *   Each half (front + right, back + left) is one rigid glued unit that swings
 *   in as the tube is squared.
 * - Closed: the outer flaps butt at the centre line z = W/2; each lock flap lies
 *   over the OTHER half's outer flap, so the halves hold each other shut.
 *
 * Flat (x): [glue][front][right][back][left]; bottom flaps hang below y = H.
 */
export function buildCrashLockTree(p: CrashLockParams): FoldTree {
  const b = new CartonBuilder(p);
  b.addBodyAndGlueStrip();
  b.addTuckClosure("top", "back", 0, -1);
  b.addDustFlaps("top");

  const { P, L, W, H } = b;
  const half = W / 2;
  const taper = p.lockFlapTaper;
  for (const { major, minor } of HALVES) {
    const x0 = b.bodyX[major];
    const x1 = b.bodyX[minor]; // = x0 + L
    const main = `bottom-${major}`;
    const tab = `glue-tab-${major}`;
    const lock = `lock-${minor}`;
    b.addPanel(main, "bottom-flap", `bottom ${major}`, { polygon: poly(P(x0, H), P(x1, H), P(x1 - half, H + half), P(x0, H + half)) }, true);
    b.addHinge(main, major, P(x0, H), P(x1, H));
    b.addPanel(tab, "glue-flap", `glue tab ${major}`, { polygon: poly(P(x1, H), P(x1, H + half), P(x1 - half, H + half)) }, false);
    b.addHinge(tab, main, P(x1, H), P(x1 - half, H + half), 180);
    b.addPanel(lock, "lock-flap", `lock ${minor}`, { polygon: poly(P(x1, H), P(x1 + W, H), P(x1 + W - taper, H + half), P(x1, H + half)) }, false);
    b.addHinge(lock, minor, P(x1, H), P(x1 + W, H));
    // Tab and lock flap are separated by a cut on the body crease line.
    b.slits.push({ id: `slit-tab-${major}`, a: P(x1, H), b: P(x1, H + half) });
    // Without taper the right lock flap touches the back flap edge-to-edge.
    if (taper === 0 && minor === "right") b.slits.push({ id: "slit-lock-right", a: P(x1 + W, H), b: P(x1 + W, H + half) });
  }
  return b.tree();
}

/** Validate params, build the flat dieline, run all checks. Never returns invalid geometry. */
export function generateCrashLockCarton(input: unknown): DielineGeometry {
  const { params, unverifiedDefaultsUsed } = resolveCrashLockParams(input);
  const { L, W } = effectiveDims(params);
  const tree = buildCrashLockTree(params);
  const expect = tubeExpectations(params, {
    extent: W / 2,
    // 4 bottom hinges + 2 tab creases, each the diagonal of a W/2 square.
    crease: 2 * L + 2 * W + 2 * Math.SQRT2 * (W / 2),
    lids: [],
  });
  return finalizeCarton({
    templateId: CRASH_LOCK_TEMPLATE_ID,
    params,
    unverifiedDefaultsUsed,
    tree,
    expect,
    extraChecks: (world) => crashLockChecks(params, tree, world),
  });
}

/**
 * Checks on the closed bottom. Expected areas come from L and W only.
 * Folded bottom panels are projected onto the bottom plane as (x, z).
 */
export function crashLockChecks(p: CrashLockParams, tree: FoldTree, world: Map<string, readonly number[]>): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });
  const { L, W, H } = effectiveDims(p);
  const o = sheetOrigin(p);
  const floorY = o.y + H;
  // Clipper works on a 0.1 micrometre grid; allow for that rounding along edges.
  const tol = 1e-3 * (L + W);

  const ids = HALVES.flatMap(({ major, minor }) => [`bottom-${major}`, `glue-tab-${major}`, `lock-${minor}`]);
  const folded = new Map<string, Vec2[]>();
  let worstY = 0;
  for (const id of ids) {
    const panel = tree.panels.find((x) => x.id === id);
    const m = world.get(id);
    if (!panel || !m) {
      check("folded-bottom-panels-present", false, `missing ${id}`);
      return out;
    }
    const pts = panel.polygon.map((v) => transformPoint(m, flatPoint(v)));
    worstY = Math.max(worstY, ...pts.map((q) => Math.abs(q.y - floorY)));
    folded.set(id, pts.map((q) => vec(q.x, q.z)));
  }
  const F = (id: string) => folded.get(id)!;

  check("folded-bottom-flat", worstY <= 1e-6, `all bottom panels within ${worstY.toExponential(2)} mm of the bottom plane`);

  const floorIds = ["bottom-front", "bottom-back", "lock-right", "lock-left"];
  const covered = unionArea(floorIds.map(F));
  check("folded-bottom-covered", Math.abs(covered - L * W) <= tol, `bottom covered ${covered.toFixed(3)} of ${(L * W).toFixed(3)} mm2`);

  const outerOverlap = intersectionArea(F("bottom-front"), F("bottom-back"));
  check("folded-outer-flaps-no-overlap", outerOverlap <= tol, `front/back flap overlap ${outerOverlap.toFixed(4)} mm2`);
  const lockOverlap = intersectionArea(F("lock-right"), F("lock-left"));
  check("folded-lock-flaps-no-overlap", lockOverlap <= tol, `lock flap overlap ${lockOverlap.toFixed(4)} mm2`);

  const tabArea = (W / 2) ** 2 / 2;
  for (const { major, minor } of HALVES) {
    const glued = intersectionArea(F(`glue-tab-${major}`), F(`lock-${minor}`));
    check(
      `folded-glue-tab-${major}-on-lock`,
      Math.abs(glued - tabArea) <= tol && Math.abs(area(F(`glue-tab-${major}`)) - tabArea) <= tol,
      `tab on lock flap ${glued.toFixed(3)} of ${tabArea.toFixed(3)} mm2`,
    );
  }

  // Each lock flap must rest on the other half's outer flap, or the bottom can open.
  for (const [lock, other] of [["lock-right", "bottom-back"], ["lock-left", "bottom-front"]] as const) {
    const support = intersectionArea(F(lock), F(other));
    check(`folded-${lock}-engages`, support > tol, `${lock} rests on ${other} over ${support.toFixed(3)} mm2`);
  }
  return out;
}
