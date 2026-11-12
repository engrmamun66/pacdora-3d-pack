import { foldTree } from "../fold-tree/fold3d";
import type { FoldTree, PanelRole } from "../fold-tree/types";
import { type Vec2, vec } from "../primitives/vec2";
import type { FoldSetup, PartSizeMode } from "./imported-fold";
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
  /** Only with extra pieces: where this (main) piece lies on the flat sheet, as imported. */
  readonly box?: Box2;
  /** Extra pieces (lid, insert...) in the order of the fold setup. Absent for a single piece. */
  readonly parts?: readonly PartPlan[];
  /** Cut slots beside the dust flaps: the strips whose width follows the board thickness. */
  readonly slots?: readonly Slot[];
}

/**
 * A cut slot: a dust flap's hinge ends at `m`, and the panel it hangs from ends at `e` (`m` = `e` when the hinge
 * runs the whole edge, the flap's corner then touching the closure beside it). `o` is the hinge's other end and
 * `at` where the hinge lies across (all places in imported mm). A thicker board pulls the flap's corner back from
 * `e`, so a cut slot of (factor x the extra thickness) opens between the flap and the closure.
 */
export interface Slot {
  readonly axis: "x" | "y";
  readonly m: number;
  readonly e: number;
  readonly o: number;
  readonly at: number;
  readonly flapId: string;
  readonly parentId: string;
  readonly hingeId: string;
  /** The flap's own outline neighbour of the hinge end that is not along the hinge (imported mm): its slanted or straight side. Absent if the flap has none there. */
  readonly side?: { readonly x: number; readonly y: number };
}

/** A drawn strip between a flap's hinge end and its panel's end wider than this (imported mm) is not a slot but a different shape. */
const SLOT_MAX = 10;

/** A rectangle on the flat sheet (imported mm). */
export interface Box2 {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export type BaseKey = "baseWidth" | "baseHeight";

/** How one extra piece of the sheet can be stretched. */
export interface PartPlan {
  readonly rootId: string;
  /** Shown to customers ("Lid"). */
  readonly name: string;
  readonly box: Box2;
  /** The piece's own stretching (its height and flaps). Null = the piece only follows the overall scale. */
  readonly plan: ResizePlan | null;
  /** How the piece's sizes behave (the admin's choice; default follow). Fixed pieces are only scaled, whatever `plan` is. */
  readonly mode: PartSizeMode;
  /**
   * Which base size of the main piece each base size of this piece follows: the piece keeps the
   * size difference it was drawn with (or the customer's "fit gap") to the main piece's base.
   */
  readonly link?: { readonly baseWidth: BaseKey; readonly baseHeight: BaseKey };
  /** True when `link` pairs the sizes crosswise (width with the main body's height), after the admin's choice. */
  readonly turned?: boolean;
  /** What the guess alone says about `turned` (what the admin's swap switches away from). */
  readonly guessedTurned?: boolean;
}

/** The plan that really stretches a piece (none for a fixed one). */
export const stretchPlanOf = (q: Pick<PartPlan, "plan" | "mode">): ResizePlan | null => (q.mode === "fixed" ? null : q.plan);

/** The three sizes the customer may set (mm); a missing one follows the overall scale. */
export interface PartSizes {
  readonly baseWidth?: number;
  readonly baseHeight?: number;
  readonly boxHeight?: number;
  readonly tuckDepth?: number;
  readonly glueFlapWidth?: number;
  readonly dustFlapDepth?: number;
  /** Customer input only: the space between an extra piece's walls and the main body's (mm, each side). */
  readonly gap?: number;
  /** How much wider (mm, on the sheet) the cut slots beside the dust flaps are than drawn: follows the board thickness. */
  readonly slotDelta?: number;
  /** Sizes of the extra pieces, in the order of the fold setup. */
  readonly parts?: readonly PartSizes[];
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
  if (!setup || setup.hinges.length === 0) return null;
  const main = planPiece(pieceOf(setup, setup.rootId), flapOf);
  if (!main) return null;
  const specs = setup.parts ?? [];
  if (specs.length === 0) return main;

  // Extra pieces (lid, insert...): each is stretched on its own and follows the main piece's base.
  const mainBox = boxOf(pieceOf(setup, setup.rootId).panels);
  const parts: PartPlan[] = specs.map((q, i) => {
    const sub = pieceOf(setup, q.rootId);
    const plan = sub.hinges.length > 0 ? planPiece(sub, flapOf) : null;
    const guessed = plan ? guessTurned(main, plan) : false;
    const turned = guessed !== (q.link?.swap === true);
    return {
      rootId: q.rootId,
      name: q.name || `Part ${i + 2}`,
      box: boxOf(sub.panels),
      plan,
      mode: q.link?.mode ?? "follow",
      ...(plan ? { link: turned ? ({ baseWidth: "baseHeight", baseHeight: "baseWidth" } as const) : ({ baseWidth: "baseWidth", baseHeight: "baseHeight" } as const), turned, guessedTurned: guessed } : {}),
    };
  });
  // The pieces must lie apart on the sheet, or one piece's stretch would drag the other's lines.
  const boxes = [mainBox, ...parts.map((q) => q.box)];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const apart = a.x1 + PIECE_GAP <= b.x0 || b.x1 + PIECE_GAP <= a.x0 || a.y1 + PIECE_GAP <= b.y0 || b.y1 + PIECE_GAP <= a.y0;
      if (!apart) return null;
    }
  }
  return { ...main, box: mainBox, parts };
}

/** Pieces closer than this (imported mm) count as touching. */
const PIECE_GAP = 0.01;

/** The panels and hinges of the piece that hangs from `rootId`. */
function pieceOf(setup: FoldSetup, rootId: string): PieceSetup {
  const ids = new Set([rootId]);
  const todo = [rootId];
  while (todo.length > 0) {
    const id = todo.pop()!;
    for (const h of setup.hinges) {
      if (h.parentId === id && !ids.has(h.childId)) {
        ids.add(h.childId);
        todo.push(h.childId);
      }
    }
  }
  return { rootId, panels: setup.panels.filter((p) => ids.has(p.id)), hinges: setup.hinges.filter((h) => ids.has(h.parentId) && ids.has(h.childId)) };
}

type PieceSetup = Pick<FoldSetup, "rootId" | "panels" | "hinges">;

function boxOf(panels: PieceSetup["panels"]): Box2 {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of panels) {
    for (let i = 0; i + 1 < p.polygon.length; i += 2) {
      x0 = Math.min(x0, p.polygon[i]!);
      x1 = Math.max(x1, p.polygon[i]!);
      y0 = Math.min(y0, p.polygon[i + 1]!);
      y1 = Math.max(y1, p.polygon[i + 1]!);
    }
  }
  return { x0, x1, y0, y1 };
}

/** Guess how a piece's base sizes pair with the main piece's: crosswise when that needs the smaller total change (a lid drawn turned by 90 degrees). */
function guessTurned(main: ResizePlan, part: ResizePlan): boolean {
  const straight = Math.abs(part.natural.baseWidth - main.natural.baseWidth) + Math.abs(part.natural.baseHeight - main.natural.baseHeight);
  const turned = Math.abs(part.natural.baseWidth - main.natural.baseHeight) + Math.abs(part.natural.baseHeight - main.natural.baseWidth);
  return turned < straight;
}

/** Stretching plan of one piece (a connected set of panels with one base panel). Null if it cannot be stretched. */
function planPiece(setup: PieceSetup, flapOf: Partial<Record<PanelRole, SizeClass>>): ResizePlan | null {
  if (setup.hinges.length === 0) return null;
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
  const slots = findSlots(setup, boxes);
  return { natural: { baseWidth, baseHeight, boxHeight, ...flaps }, xs, xClass, ys, yClass, tube: setup.panels.some((p) => p.role === "tuck"), ...(slots.length > 0 ? { slots } : {}) };
}

/** True if the point lies on the outline of the polygon (a flat x,y,x,y list), vertices included. */
function onOutline(poly: readonly number[], x: number, y: number): boolean {
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x1, y1, x2, y2] = [poly[i * 2]!, poly[i * 2 + 1]!, poly[j * 2]!, poly[j * 2 + 1]!];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    if (Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < 1e-3) return true;
  }
  return false;
}

/** Roles of the flaps whose corner next to another panel gets a cut slot. */
const SLOT_ROLES: readonly PanelRole[] = ["dust-flap", "tuck"];

/**
 * The cut slots beside flaps: the ends of a flap's hinge that lie at the end of the panel it hangs from, with another
 * panel (the closure, a neighbouring wall...) touching the flap's corner there, or that stop a little short of that end.
 */
function findSlots(setup: PieceSetup, boxes: ReadonlyMap<string, Box>): Slot[] {
  const out: Slot[] = [];
  // A flap is a leaf: nothing hangs from it (a panel that carries flaps of its own is a wall or a closure).
  const parents = new Set(setup.hinges.map((h) => h.parentId));
  for (const h of setup.hinges) {
    const flap = setup.panels.find((p) => p.id === h.childId);
    const parent = boxes.get(h.parentId);
    if (!flap || !SLOT_ROLES.includes(flap.role) || !parent || parents.has(flap.id)) continue;
    const alongX = Math.abs(h.line[2] - h.line[0]) >= Math.abs(h.line[3] - h.line[1]); // the hinge runs along x
    const lo = alongX ? Math.min(h.line[0], h.line[2]) : Math.min(h.line[1], h.line[3]);
    const hi = alongX ? Math.max(h.line[0], h.line[2]) : Math.max(h.line[1], h.line[3]);
    const at = alongX ? (h.line[1] + h.line[3]) / 2 : (h.line[0] + h.line[2]) / 2;
    const [p0, p1] = alongX ? [parent.x0, parent.x1] : [parent.y0, parent.y1];
    const axis = alongX ? "x" : "y";
    const base = { axis, at, flapId: h.childId, parentId: h.parentId, hingeId: h.id } as const;
    const touched = (along: number) =>
      setup.panels.some((q) => q.id !== h.childId && q.id !== h.parentId && onOutline(q.polygon, alongX ? along : at, alongX ? at : along));
    /** The flap's outline neighbour of the vertex at this end that is off the hinge line. */
    const sideOf = (along: number): { x: number; y: number } | undefined => {
      const poly = flap.polygon;
      const n = poly.length / 2;
      const [vx, vy] = alongX ? [along, at] : [at, along];
      for (let i = 0; i < n; i++) {
        if (Math.hypot(poly[i * 2]! - vx, poly[i * 2 + 1]! - vy) > 1e-3) continue;
        for (const j of [(i + 1) % n, (i + n - 1) % n]) {
          const x = poly[j * 2]!;
          const y = poly[j * 2 + 1]!;
          if (Math.abs((alongX ? y : x) - at) > 1e-3) return { x, y };
        }
      }
      return undefined;
    };
    const end = (along: number, edge: number) => {
      const gap = Math.abs(edge - along);
      if (gap > SLOT_MAX) return false;
      return gap > MERGE || touched(along);
    };
    const sideHi = sideOf(hi);
    const sideLo = sideOf(lo);
    if (end(hi, p1) && hi <= p1 + MERGE) out.push({ ...base, m: hi, e: p1, o: lo, ...(sideHi ? { side: sideHi } : {}) });
    if (end(lo, p0) && lo >= p0 - MERGE) out.push({ ...base, m: lo, e: p0, o: hi, ...(sideLo ? { side: sideLo } : {}) });
  }
  return out;
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
  const plain = (p: Vec2) => vec(origin.x + (p.x - origin.x) * k, origin.y + (p.y - origin.y) * k);
  if (plan?.parts && plan.parts.length > 0 && plan.box) return multiMap(origin, k, plan, sizes, plain);
  const ratio = plan ? resizeRatios(plan, k, sizes) : null;
  if (!plan || !ratio || isPlain(ratio)) return plain;
  const fx = axisMap(plan.xs, plan.xClass, origin.x, k, ratio);
  const fy = axisMap(plan.ys, plan.yClass, origin.y, k, ratio);
  return (p) => vec(fx(p.x), fy(p.y));
}

const isPlain = (r: Record<SizeClass, number>) => r.W === 1 && r.H === 1 && r.D === 1 && r.T === 1 && r.G === 1 && r.F === 1;

/**
 * Several pieces on the sheet: each point is stretched by the map of the piece it lies in, and a
 * piece that grows or shrinks pushes the pieces to its right and below it along, so the gaps between pieces stay.
 */
function multiMap(origin: Vec2, k: number, plan: ResizePlan, sizes: PartSizes, plain: (p: Vec2) => Vec2): (p: Vec2) => Vec2 {
  const items = [
    { box: plan.box!, plan: plan as ResizePlan | null, sizes },
    ...plan.parts!.map((q, i) => ({ box: q.box, plan: stretchPlanOf(q), sizes: sizes.parts?.[i] ?? ({} as PartSizes) })),
  ];
  const maps = items.map((it) => {
    const ratio = it.plan ? resizeRatios(it.plan, k, it.sizes) : null;
    if (!it.plan || !ratio || isPlain(ratio)) return { fx: (v: number) => origin.x + (v - origin.x) * k, fy: (v: number) => origin.y + (v - origin.y) * k, plain: true };
    return { fx: axisMap(it.plan.xs, it.plan.xClass, origin.x, k, ratio), fy: axisMap(it.plan.ys, it.plan.yClass, origin.y, k, ratio), plain: false };
  });
  if (maps.every((m) => m.plain)) return plain;

  // How much wider / taller each piece became than the plain scale makes it.
  const growX = items.map((it, i) => maps[i]!.fx(it.box.x1) - maps[i]!.fx(it.box.x0) - (it.box.x1 - it.box.x0) * k);
  const growY = items.map((it, i) => maps[i]!.fy(it.box.y1) - maps[i]!.fy(it.box.y0) - (it.box.y1 - it.box.y0) * k);
  const shift = (lo: "x0" | "y0", hi: "x1" | "y1", grow: number[]) => {
    const out = items.map(() => 0);
    const order = items.map((_, i) => i).sort((a, b) => items[a]!.box[lo] - items[b]!.box[lo]);
    for (const i of order) {
      let best: number | null = null;
      for (const j of order) {
        if (j === i || items[j]!.box[hi] > items[i]!.box[lo] + PIECE_GAP) continue;
        const v = out[j]! + grow[j]!;
        if (best === null || v > best) best = v;
      }
      out[i] = best ?? 0;
    }
    return out;
  };
  const sx = shift("x0", "x1", growX);
  const sy = shift("y0", "y1", growY);

  const pick = (p: Vec2): number => {
    let best = 0;
    let bestD = Infinity;
    items.forEach((it, i) => {
      const dx = Math.max(it.box.x0 - p.x, 0, p.x - it.box.x1);
      const dy = Math.max(it.box.y0 - p.y, 0, p.y - it.box.y1);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  return (p) => {
    const i = pick(p);
    return vec(maps[i]!.fx(p.x) + sx[i]!, maps[i]!.fy(p.y) + sy[i]!);
  };
}

/** A flap corner that moves because of the board thickness (see `slotEdits`). */
interface SlotCorner {
  readonly slot: Slot;
  /** The hinge end in imported coordinates, and where the flap's corner goes on the sheet. */
  readonly vIn: Vec2;
  readonly mOut: Vec2;
  /** Where the panel's own end (the closure's corner) goes on the sheet. */
  readonly eOut: Vec2;
  /** Which way from the panel's end the flap's other end lies, along the slot's axis, in imported coordinates. */
  readonly towardFlap: number;
  /** The drawn flap corner touches the closure (no drawn strip): the cut outline gets two corners there instead of one. */
  readonly split: boolean;
}

const SAME = 1e-3;

export interface SlotEdits {
  /** Corner moves exist (the board differs from the drawn one and the sheet has dust flaps with slots). */
  readonly active: boolean;
  /** A closed cut outline: its flap corners pulled back from the closures. Input in imported coordinates, output on the sheet. */
  loop(points: readonly Vec2[]): Vec2[];
  /** The fold-line polylines of one path: those ending at a flap corner end at its new place; one passing through is cut in two. */
  crease(points: readonly Vec2[]): Vec2[][];
  /** A panel's outline (imported coordinates): the flap moves its corner (and, when the drawing left a strip, so does its parent). */
  panel(panelId: string, points: readonly Vec2[]): Vec2[];
  /** The ends of a hinge (imported coordinates). */
  hinge(hingeId: string, a: Vec2, b: Vec2): [Vec2, Vec2];
}

/**
 * The cut slot beside a dust flap follows the board: a thicker board than the drawing was made for (a thinner one
 * narrows a drawn slot) pulls the flap's corner back from the closure beside it, by `slotDelta` mm. Only the flap's
 * own corner moves (its polygon, the hinge end, the cut outline and the fold line), so no box size changes, and
 * the closure keeps its corner. This cannot be done by stretching the sheet: the flap's corner and the closure's
 * corner can be the very same point of the drawing.
 */
export function slotEdits(plan: ResizePlan | null, sizes: PartSizes, map: (p: Vec2) => Vec2): SlotEdits {
  const corners: SlotCorner[] = [];
  const pick = (pl: ResizePlan | null, sz: PartSizes) => {
    const delta = sz.slotDelta ?? 0;
    if (!pl?.slots || Math.abs(delta) < 1e-9) return;
    for (const slot of pl.slots) {
      const at = (along: number, across: number) => (slot.axis === "x" ? vec(along, across) : vec(across, along));
      const vIn = at(slot.m, slot.at);
      const eIn = at(slot.e, slot.at);
      const oIn = at(slot.o, slot.at);
      const [vm, ve, vo] = [map(vIn), map(eIn), map(oIn)];
      const c = (p: Vec2) => (slot.axis === "x" ? p.x : p.y);
      const toward = Math.sign(c(vo) - c(vm));
      if (toward === 0) continue;
      const strip = Math.abs(c(ve) - c(vm));
      const flap = Math.abs(c(vo) - c(vm));
      // A drawn strip can narrow to nothing; the flap keeps at least a fifth of its hinge.
      const d = Math.max(-strip, Math.min(delta, flap * 0.8));
      if (Math.abs(d) < 1e-6) continue;
      const mOut = slot.axis === "x" ? vec(c(vm) + toward * d, vm.y) : vec(vm.x, c(vm) + toward * d);
      corners.push({ slot, vIn, mOut, eOut: ve, towardFlap: Math.sign(slot.o - slot.m) || Math.sign(slot.m - slot.e) * -1 || 1, split: Math.abs(slot.m - slot.e) < SAME });
    }
  };
  pick(plan, sizes);
  (plan?.parts ?? []).forEach((q, i) => pick(stretchPlanOf(q), sizes.parts?.[i] ?? {}));
  const near = (a: Vec2, b: Vec2, tol = SAME) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
  /** Every flap corner at this point (two flaps may meet there: they then share the slot). */
  const findAll = (p: Vec2) => corners.filter((c) => near(c.vIn, p));
  const alongOf = (c: SlotCorner, p: Vec2) => (c.slot.axis === "x" ? p.x : p.y);
  const acrossOf = (c: SlotCorner, p: Vec2) => (c.slot.axis === "x" ? p.y : p.x);
  /** A neighbour of the corner that lies on the flap's hinge (same line across, toward the flap along the axis). */
  const onHinge = (c: SlotCorner, n: Vec2 | undefined) => n !== undefined && Math.abs(acrossOf(c, n) - c.slot.at) < SAME && (alongOf(c, n) - c.slot.m) * c.towardFlap > SAME;
  /** The corner whose flap owns the cut edge that runs from the point to `n` (the flap's own side), if any. */
  const ownerOfEdge = (cs: readonly SlotCorner[], n: Vec2 | undefined) => (n === undefined ? undefined : cs.find((c) => c.slot.side !== undefined && near(vec(c.slot.side.x, c.slot.side.y), n, 1e-2)));
  const ownerOfHinge = (cs: readonly SlotCorner[], n: Vec2 | undefined) => cs.find((c) => onHinge(c, n));
  const same = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;

  return {
    active: corners.length > 0,
    loop(points) {
      const out: Vec2[] = [];
      const push = (...pts: Vec2[]) => {
        for (const q of pts) if (out.length === 0 || !same(out[out.length - 1]!, q)) out.push(q);
      };
      const n = points.length;
      points.forEach((p, i) => {
        const cs = findAll(p);
        if (cs.length === 0) {
          push(map(p));
          return;
        }
        // A drawn strip: the vertex is the flap's corner and simply moves.
        if (!cs[0]!.split) {
          push(cs[0]!.mOut);
          return;
        }
        // Flap and closure share the point: the outline runs from one's edge to the other's, so each edge gets its own corner.
        const prev = points[(i + n - 1) % n];
        const next = points[(i + 1) % n];
        const ends = [prev, next].map((q) => ownerOfEdge(cs, q)?.mOut ?? cs[0]!.eOut);
        push(...ends);
      });
      if (out.length > 1 && same(out[0]!, out[out.length - 1]!)) out.pop();
      return out;
    },
    crease(points) {
      const result: Vec2[][] = [];
      let run: Vec2[] = [];
      const flush = () => {
        if (run.length >= 2) result.push(run);
        run = [];
      };
      points.forEach((p, i) => {
        const cs = findAll(p);
        if (cs.length === 0) {
          run.push(map(p));
          return;
        }
        const prev = points[i - 1];
        const next = points[i + 1];
        const before = ownerOfHinge(cs, prev);
        const after = ownerOfHinge(cs, next);
        if (!cs[0]!.split) {
          run.push(before || after ? (before ?? after)!.mOut : map(p));
          return;
        }
        if (!before && !after) {
          run.push(map(p));
          return;
        }
        // The fold line stops at the flap's new corner; what lies beyond (the closure's own line) starts at the closure's corner.
        if (prev !== undefined) {
          run.push(before ? before.mOut : cs[0]!.eOut);
          flush();
        }
        if (next !== undefined) run.push(after ? after.mOut : cs[0]!.eOut);
      });
      flush();
      return result;
    },
    panel(panelId, points) {
      return points.map((p) => {
        const c = findAll(p).find((x) => x.slot.flapId === panelId || (!x.split && x.slot.parentId === panelId));
        return c ? c.mOut : map(p);
      });
    },
    hinge(hingeId, a, b) {
      const move = (p: Vec2) => findAll(p).find((c) => c.slot.hingeId === hingeId)?.mOut ?? map(p);
      return [move(a), move(b)];
    },
  };
}
