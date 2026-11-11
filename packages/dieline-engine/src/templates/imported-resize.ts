import { foldTree } from "../fold-tree/fold3d";
import type { FoldTree, PanelRole } from "../fold-tree/types";
import { type Vec2, vec } from "../primitives/vec2";
import type { FoldSetup } from "./imported-fold";
import { flatSignedArea } from "./imported-fold-util";

/**
 * Resizing parts of an imported (folded) dieline.
 *
 * The flat sheet is stretched with one piecewise-linear map per axis. Every stretch
 * of the sheet along x or y belongs to one of three sizes of the closed box:
 *   W  base width   (the base panel's own x extent)
 *   H  base height  (the base panel's own y extent)
 *   D  box height   (how far the side walls stand up from the base)
 * and, for the flap kinds the admin switched on (box settings), three more that only move a stretch of the sheet that
 * nothing but those flaps covers (so changing them never moves a wall):
 *   T  tuck flap depth        G  glue flap width        F  dust flap depth
 * Which one is found from how each panel ends up once the box is closed: a panel
 * edge direction that points along the box's x, y or z axis belongs to W, H or D.
 * Because every point of the sheet (panels, hinges, cut and fold lines) goes through
 * the same map, panels still share exactly the same edges after resizing.
 */

export type SizeClass = "W" | "H" | "D" | "T" | "G" | "F";

export interface ResizePlan {
  /** Size (mm, as imported) of the base width, base height and box height. */
  readonly natural: {
    readonly baseWidth: number;
    readonly baseHeight: number;
    readonly boxHeight: number;
    /** Only present when some stretch of the sheet is covered by flaps of that kind alone. */
    readonly tuckDepth?: number;
    readonly glueFlapWidth?: number;
    readonly dustFlapDepth?: number;
  };
  /** Sorted places (imported x) where the stretching can change, and the size each gap between them follows. */
  readonly xs: readonly number[];
  readonly xClass: readonly (SizeClass | null)[];
  readonly ys: readonly number[];
  readonly yClass: readonly (SizeClass | null)[];
  /** True when the admin marked tuck flaps: a tube carton (taller than wide) rather than a tray. */
  readonly tube: boolean;
}

/** The three sizes the customer may set (mm); a missing one follows the overall scale. */
export interface PartSizes {
  readonly baseWidth?: number;
  readonly baseHeight?: number;
  readonly boxHeight?: number;
  readonly tuckDepth?: number;
  readonly glueFlapWidth?: number;
  readonly dustFlapDepth?: number;
}

/** The size key of each flap class. */
export const FLAP_KEYS = { T: "tuckDepth", G: "glueFlapWidth", F: "dustFlapDepth" } as const;
const FLAP_OF_ROLE: Partial<Record<PanelRole, SizeClass>> = { tuck: "T", "glue-flap": "G", "dust-flap": "F" };
/** The flap classes (not W, H or D). */
export type FlapClass = "T" | "G" | "F";

const AXIS_CLASS: readonly SizeClass[] = ["W", "H", "D"];
/** Gaps between places closer than this (imported mm) are merged. */
const MERGE = 1e-3;
/** A panel edge counts as lying along a box axis if it is within about 30 degrees of it. */
const AXIS_DOT = 0.85;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  area: number;
  /** Class of the panel's flat x direction and flat y direction, once folded. */
  cx: SizeClass | null;
  cy: SizeClass | null;
  role: PanelRole;
}

function axisOf(a: number, b: number, c: number): SizeClass | null {
  const v = [Math.abs(a), Math.abs(b), Math.abs(c)];
  const i = v[0]! >= v[1]! && v[0]! >= v[2]! ? 0 : v[1]! >= v[2]! ? 1 : 2;
  return v[i]! >= AXIS_DOT ? AXIS_CLASS[i]! : null;
}

function places(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1]! > MERGE) out.push(v);
  }
  return out;
}

/** The gap classes along one axis: the class with the most panel area covering each gap. */
function gapClasses(breaks: readonly number[], boxes: readonly Box[], axis: "x" | "y", flapOf: Partial<Record<PanelRole, SizeClass>>): (SizeClass | null)[] {
  const out: (SizeClass | null)[] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const mid = (breaks[i]! + breaks[i + 1]!) / 2;
    // Covered by flaps of one kind only: that stretch belongs to the flap, not to a wall.
    const cover = boxes.filter((b) => (axis === "x" ? mid >= b.x0 - MERGE && mid <= b.x1 + MERGE : mid >= b.y0 - MERGE && mid <= b.y1 + MERGE));
    const flap = cover.length > 0 ? flapOf[cover[0]!.role] : undefined;
    if (flap && cover.every((b) => flapOf[b.role] === flap)) {
      out.push(flap);
      continue;
    }
    const weight: Record<SizeClass, number> = { W: 0, H: 0, D: 0, T: 0, G: 0, F: 0 };
    for (const b of boxes) {
      const [lo, hi, cls] = axis === "x" ? [b.x0, b.x1, b.cx] : [b.y0, b.y1, b.cy];
      if (cls && mid >= lo - MERGE && mid <= hi + MERGE) weight[cls] += b.area;
    }
    let best: SizeClass | null = null;
    for (const c of AXIS_CLASS) if (weight[c] > 0 && (best === null || weight[c] > weight[best])) best = c;
    out.push(best);
  }
  return out;
}

/**
 * Work out how the sheet can be stretched. Null if it cannot (no fold, extra parts such as a lid
 * piece, no walls on the base, or a fold that does not close along the box's axes).
 */
export function planResize(setup: FoldSetup | null | undefined, enabled: readonly FlapClass[] = []): ResizePlan | null {
  const flapOf = Object.fromEntries(Object.entries(FLAP_OF_ROLE).filter(([, c]) => enabled.includes(c as FlapClass))) as Partial<Record<PanelRole, SizeClass>>;
  if (!setup || setup.hinges.length === 0 || (setup.parts?.length ?? 0) > 0) return null;
  const root = setup.panels.find((p) => p.id === setup.rootId);
  if (!root) return null;
  const polys = new Map(setup.panels.map((p) => [p.id, Array.from({ length: p.polygon.length / 2 }, (_, i) => vec(p.polygon[i * 2]!, p.polygon[i * 2 + 1]!))]));
  const tree: FoldTree = {
    rootId: setup.rootId,
    panels: setup.panels.map((p) => ({ id: p.id, role: p.role, label: p.label, printable: p.printable, polygon: polys.get(p.id)! })),
    hinges: setup.hinges.map((h) => ({ id: h.id, parentId: h.parentId, childId: h.childId, a: vec(h.line[0], h.line[1]), b: vec(h.line[2], h.line[3]), foldAngleDeg: h.angleDeg })),
  };
  let world: ReturnType<typeof foldTree>;
  try {
    world = foldTree(tree);
  } catch {
    return null;
  }

  const boxes = new Map<string, Box>();
  for (const p of setup.panels) {
    const poly = polys.get(p.id)!;
    const m = world.get(p.id);
    if (!m || poly.length < 3) return null;
    const xsP = poly.map((v) => v.x);
    const ysP = poly.map((v) => v.y);
    boxes.set(p.id, {
      x0: Math.min(...xsP),
      x1: Math.max(...xsP),
      y0: Math.min(...ysP),
      y1: Math.max(...ysP),
      area: Math.abs(flatSignedArea(p.polygon)),
      cx: axisOf(m[0]!, m[1]!, m[2]!),
      cy: axisOf(m[4]!, m[5]!, m[6]!),
      role: p.role,
    });
  }
  const all = [...boxes.values()];
  const rootBox = boxes.get(setup.rootId)!;
  // The base is the reference frame: its own x is W and its own y is H.
  if (rootBox.cx !== "W" || rootBox.cy !== "H") return null;

  // Wall height: how far each panel hinged straight onto the base reaches across its hinge.
  const reach: number[] = [];
  for (const h of setup.hinges) {
    if (h.parentId !== setup.rootId) continue;
    const c = boxes.get(h.childId);
    if (!c) continue;
    const along = Math.abs(h.line[2] - h.line[0]) >= Math.abs(h.line[3] - h.line[1]); // hinge runs along x
    reach.push(along ? c.y1 - c.y0 : c.x1 - c.x0);
  }
  if (reach.length === 0) return null;
  reach.sort((a, b) => a - b);
  const boxHeight = reach[Math.floor(reach.length / 2)]!;
  const baseWidth = rootBox.x1 - rootBox.x0;
  const baseHeight = rootBox.y1 - rootBox.y0;
  if (!(boxHeight > 0) || !(baseWidth > 0) || !(baseHeight > 0)) return null;

  const xs = places(all.flatMap((b) => [b.x0, b.x1]).concat(setup.panels.flatMap((p) => (polys.get(p.id) ?? []).map((v) => v.x))));
  const ys = places(all.flatMap((b) => [b.y0, b.y1]).concat(setup.panels.flatMap((p) => (polys.get(p.id) ?? []).map((v) => v.y))));
  if (xs.length < 2 || ys.length < 2) return null;
  const xClass = gapClasses(xs, all, "x", flapOf);
  const yClass = gapClasses(ys, all, "y", flapOf);
  // Nothing to stretch if one of the three sizes does not move any part of the sheet.
  const used = new Set<SizeClass>([...xClass, ...yClass].filter((c): c is SizeClass => c !== null));
  if (!used.has("W") || !used.has("H") || !used.has("D")) return null;
  const flaps: Partial<Record<(typeof FLAP_KEYS)[keyof typeof FLAP_KEYS], number>> = {};
  for (const cls of ["T", "G", "F"] as const) {
    const longest = Math.max(runLength(xs, xClass, cls), runLength(ys, yClass, cls));
    if (longest > 0) flaps[FLAP_KEYS[cls]] = longest;
  }
  return { natural: { baseWidth, baseHeight, boxHeight, ...flaps }, xs, xClass, ys, yClass, tube: setup.panels.some((p) => p.role === "tuck") };
}

/** Length of the longest unbroken stretch of one class along an axis (0 if none). */
function runLength(breaks: readonly number[], classes: readonly (SizeClass | null)[], cls: SizeClass): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < classes.length; i++) {
    run = classes[i] === cls ? run + (breaks[i + 1]! - breaks[i]!) : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** How much each size is stretched compared with the overall scale `k` (1 = not at all). */
export function resizeRatios(plan: ResizePlan, k: number, sizes: PartSizes): Record<SizeClass, number> {
  const ratio = (size: number | undefined, natural: number | undefined) => (size === undefined || natural === undefined ? 1 : size / (natural * k));
  return {
    W: ratio(sizes.baseWidth, plan.natural.baseWidth),
    H: ratio(sizes.baseHeight, plan.natural.baseHeight),
    D: ratio(sizes.boxHeight, plan.natural.boxHeight),
    T: ratio(sizes.tuckDepth, plan.natural.tuckDepth),
    G: ratio(sizes.glueFlapWidth, plan.natural.glueFlapWidth),
    F: ratio(sizes.dustFlapDepth, plan.natural.dustFlapDepth),
  };
}

function axisMap(breaks: readonly number[], classes: readonly (SizeClass | null)[], origin: number, k: number, ratio: Record<SizeClass, number>): (v: number) => number {
  const factor = classes.map((c) => k * (c ? ratio[c] : 1));
  const pos: number[] = [origin + (breaks[0]! - origin) * k];
  for (let i = 0; i < factor.length; i++) pos.push(pos[i]! + (breaks[i + 1]! - breaks[i]!) * factor[i]!);
  const last = breaks.length - 1;
  return (v) => {
    if (v <= breaks[0]!) return pos[0]! - (breaks[0]! - v) * k;
    if (v >= breaks[last]!) return pos[last]! + (v - breaks[last]!) * k;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid]! <= v) lo = mid;
      else hi = mid;
    }
    return pos[lo]! + (v - breaks[lo]!) * factor[lo]!;
  };
}

/**
 * Map from the imported frame to the sheet: scale `k` about `origin`, then stretch the parts.
 * With no stretch this is exactly the plain uniform scale.
 */
export function sheetMap(origin: Vec2, k: number, plan: ResizePlan | null, sizes: PartSizes): (p: Vec2) => Vec2 {
  const ratio = plan ? resizeRatios(plan, k, sizes) : null;
  if (!plan || !ratio || (ratio.W === 1 && ratio.H === 1 && ratio.D === 1 && ratio.T === 1 && ratio.G === 1 && ratio.F === 1)) {
    return (p) => vec(origin.x + (p.x - origin.x) * k, origin.y + (p.y - origin.y) * k);
  }
  const fx = axisMap(plan.xs, plan.xClass, origin.x, k, ratio);
  const fy = axisMap(plan.ys, plan.yClass, origin.y, k, ratio);
  return (p) => vec(fx(p.x), fy(p.y));
}
