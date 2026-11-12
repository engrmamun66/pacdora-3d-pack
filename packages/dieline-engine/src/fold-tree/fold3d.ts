import type { Vec2 } from "../primitives/vec2";
import type { FoldTree, PartPlacement } from "./types";

/**
 * 3D folding of a fold tree. Pure math, no rendering library.
 *
 * Frame: the flat sheet lies in the plane z = 0 using the SAME x/y as the
 * dieline (mm, x right, y down). With a right-handed frame this makes +z point
 * away from a viewer who sees the printed side (exactly like looking at the
 * SVG on screen). The printed side therefore faces -z, and folding moves child
 * panels toward +z so the unprinted faces come together and the print ends up
 * outside. Renderers that want y-up apply a fixed 180 degree rotation about x.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 4x4 matrix, column-major (same layout as three.js Matrix4.fromArray). */
export type Mat4 = readonly number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = s;
    }
  }
  return out;
}

export const translation = (x: number, y: number, z: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Rotation by `angle` radians about unit axis `u` through the origin (Rodrigues). */
export function axisAngle(u: Vec3, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const { x, y, z } = u;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return {
    x: m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!,
    y: m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!,
    z: m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!,
  };
}

export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  return {
    x: m[0]! * d.x + m[4]! * d.y + m[8]! * d.z,
    y: m[1]! * d.x + m[5]! * d.y + m[9]! * d.z,
    z: m[2]! * d.x + m[6]! * d.y + m[10]! * d.z,
  };
}

export const flatPoint = (p: Vec2): Vec3 => ({ x: p.x, y: p.y, z: 0 });

/** Normal of the printed side in the flat frame (faces the viewer, i.e. -z). */
export const PRINTED_NORMAL: Vec3 = { x: 0, y: 0, z: -1 };

export interface FoldOptions {
  /** 0 = flat, 1 = fully closed (each hinge at its foldAngleDeg). Default 1. */
  readonly progress?: number;
  /** Optional per-hinge progress override (0..1). If absent and `progress` is given, hinges with a foldOrder are staged. */
  readonly hingeProgress?: Readonly<Record<string, number>>;
}

/**
 * Fold steps of one piece. Every piece (the main body and each extra part) has its own steps,
 * numbered from 1: a part's step 1 happens together with the main body's step 1.
 */
function pieceHingeGroups(tree: FoldTree): { rootId: string; hinges: FoldTree["hinges"] }[] {
  const childrenOf = new Map<string, FoldTree["hinges"][number][]>();
  for (const h of tree.hinges) {
    const list = childrenOf.get(h.parentId) ?? [];
    list.push(h);
    childrenOf.set(h.parentId, list);
  }
  const roots = [tree.rootId, ...(tree.parts ?? []).map((q) => q.rootId)];
  return roots.map((rootId) => {
    const hinges: FoldTree["hinges"][number][] = [];
    const seen = new Set([rootId]);
    const queue = [rootId];
    for (let i = 0; i < queue.length; i++) {
      for (const h of childrenOf.get(queue[i]!) ?? []) {
        if (seen.has(h.childId)) continue;
        seen.add(h.childId);
        hinges.push(h);
        queue.push(h.childId);
      }
    }
    return { rootId, hinges };
  });
}

/**
 * When each piece folds. Pieces fold together by default; a part with timing "after" starts when the
 * piece before it has finished. Returns, per piece, the window [from, to] of the whole fold (0..1).
 */
export function foldWindows(tree: FoldTree): Map<string, { from: number; to: number }> {
  const parts = tree.parts ?? [];
  const group = new Map<string, number>([[tree.rootId, 0]]);
  let g = 0;
  for (const q of parts) {
    if (q.timing === "after") g += 1;
    group.set(q.rootId, g);
  }
  const n = g + 1;
  return new Map([...group].map(([root, k]) => [root, { from: k / n, to: (k + 1) / n }]));
}

/**
 * Staged fold progress per hinge, for a whole-fold progress 0..1. Hinges of the same piece with the
 * same foldOrder fold together; lower numbers fold first. A piece's hinges spread over that piece's
 * own window (see foldWindows). Undefined when no hinge has a foldOrder.
 */
export function stagedHingeProgress(tree: FoldTree, progress: number): Record<string, number> | undefined {
  if (!tree.hinges.some((h) => typeof h.foldOrder === "number" && Number.isFinite(h.foldOrder))) return undefined;
  const windows = foldWindows(tree);
  const p = Math.min(1, Math.max(0, progress));
  const out: Record<string, number> = {};
  for (const piece of pieceHingeGroups(tree)) {
    const w = windows.get(piece.rootId) ?? { from: 0, to: 1 };
    const local = Math.min(1, Math.max(0, (p - w.from) / (w.to - w.from)));
    const orders = [...new Set(piece.hinges.map((h) => h.foldOrder).filter((o): o is number => typeof o === "number" && Number.isFinite(o)))].sort((a, b) => a - b);
    const stepOf = new Map(orders.map((o, i) => [o, i]));
    for (const h of piece.hinges) {
      const s = h.foldOrder === undefined ? 0 : (stepOf.get(h.foldOrder) ?? 0);
      out[h.id] = orders.length === 0 ? local : Math.min(1, Math.max(0, local * orders.length - s));
    }
  }
  return out;
}

/** Share of the animation (at the end) used to move extra parts onto the main body. */
const PLACE_SHARE = 0.2;
/** Space left between a part set inside a body and the body's floor, so the two surfaces do not flicker. */
const FLOOR_CLEARANCE = 0.3;

const X_AXIS: Vec3 = { x: 1, y: 0, z: 0 };

/** Rotation by `angle` about the line through `p` with unit direction `u`. */
function rotateAbout(u: Vec3, p: Vec3, angle: number): Mat4 {
  return multiply(translation(p.x, p.y, p.z), multiply(axisAngle(u, angle), translation(-p.x, -p.y, -p.z)));
}

interface Bounds3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Bounds of the panels in `world` (optionally moved by `extra`). */
function boundsOfPanels(tree: FoldTree, world: ReadonlyMap<string, Mat4>, extra?: Mat4): Bounds3 | null {
  const b: Bounds3 = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of tree.panels) {
    const m0 = world.get(p.id);
    if (!m0) continue;
    const m = extra ? multiply(extra, m0) : m0;
    for (const v of p.polygon) {
      const q = transformPoint(m, flatPoint(v));
      b.minX = Math.min(b.minX, q.x);
      b.maxX = Math.max(b.maxX, q.x);
      b.minY = Math.min(b.minY, q.y);
      b.maxY = Math.max(b.maxY, q.y);
      b.minZ = Math.min(b.minZ, q.z);
      b.maxZ = Math.max(b.maxZ, q.z);
    }
  }
  return Number.isFinite(b.minX) ? b : null;
}

const sizeOf = (b: Bounds3): Vec3 => ({ x: b.maxX - b.minX, y: b.maxY - b.minY, z: b.maxZ - b.minZ });
const FIT_TOLERANCE = 0.01;

/** True when a part of this size stands completely inside the space of a reference piece of that size. */
function fitsInside(space: Vec3, part: Vec3): boolean {
  return part.x <= space.x + FIT_TOLERANCE && part.y <= space.y + FIT_TOLERANCE && part.z <= space.z + FIT_TOLERANCE;
}

/**
 * Where an extra part goes, as a matrix that moves it from its own folded position.
 * `t` is 0 (part still lying flat where the dieline has it) to 1 (in place).
 * `mode` must already be resolved (not "auto").
 */
function placementMatrix(ref: Bounds3, part: Bounds3, mode: "closed" | "open" | "beside" | "inside", pl: PartPlacement, t: number): Mat4 {
  const rcx = (ref.minX + ref.maxX) / 2;
  const rcy = (ref.minY + ref.maxY) / 2;
  const pcx = (part.minX + part.maxX) / 2;
  const pcy = (part.minY + part.maxY) / 2;
  const gap = Number.isFinite(pl.gap) ? pl.gap! : 0;
  const off = pl.offset;
  const shift = translation(t * (off?.x ?? 0), t * (off?.y ?? 0), t * (off?.z ?? 0));
  let base: Mat4;
  if (mode === "beside") {
    const space = Number.isFinite(pl.gap) ? gap : Math.max(10, 0.15 * (ref.maxX - ref.minX));
    const z = ref.minZ - part.minZ;
    switch (pl.side ?? "right") {
      case "left":
        base = translation(t * (ref.minX - space - part.maxX), t * (rcy - pcy), t * z);
        break;
      case "front":
        base = translation(t * (rcx - pcx), t * (ref.minY - space - part.maxY), t * z);
        break;
      case "back":
        base = translation(t * (rcx - pcx), t * (ref.maxY + space - part.minY), t * z);
        break;
      default:
        base = translation(t * (ref.maxX + space - part.minX), t * (rcy - pcy), t * z);
    }
  } else if (mode === "inside") {
    // Upright, in the middle of the body, standing on its floor.
    base = translation(t * (rcx - pcx), t * (rcy - pcy), t * (ref.minZ + FLOOR_CLEARANCE + gap - part.minZ));
  } else {
    // Flip the part over about a line through its own middle, then set it on the body's rim.
    const flip = rotateAbout(X_AXIS, { x: 0, y: pcy, z: 0 }, Math.PI * t);
    const move = translation(t * (rcx - pcx), t * (rcy - pcy), t * (ref.maxZ + gap + part.maxZ));
    const closed = multiply(move, flip);
    const openDeg = pl.openDeg ?? 30;
    if (mode === "closed" || openDeg <= 0) base = closed;
    else {
      // Hinged at the back edge of the body (the largest y: farthest from a viewer of the upright model).
      const swing = rotateAbout(X_AXIS, { x: 0, y: ref.maxY, z: ref.maxZ + gap }, (-openDeg * Math.PI * t) / 180);
      base = multiply(swing, closed);
    }
  }
  // On its way the part hops up and over: it rises to `hop` at the middle of the move and comes down as it arrives.
  // (Without it the part slides straight through the other piece.) Zero at both ends, so the final position is unchanged.
  // Automatic height: just enough to clear the other piece's rim at the middle of the move. A part that flips
  // over (closed / open) is also standing on its edge there, so it needs a little more; flipping about x swings it by half its depth.
  const refH = ref.maxZ - ref.minZ;
  const partH = part.maxZ - part.minZ;
  const flips = mode === "closed" || mode === "open";
  const auto = flips ? Math.max(refH + 10, 0.5 * refH + (part.maxY - part.minY) / 2 - 0.5 * partH + 10) : refH + 10;
  const hop = Number.isFinite(pl.hop) ? Math.max(0, pl.hop!) : auto;
  const lift = t <= 0 || t >= 1 ? 0 : hop * Math.sin(Math.PI * t);
  return multiply(translation(0, 0, lift), multiply(shift, base));
}

/** How an extra part's closed size compares with the space in the piece it is placed against. */
export interface PartFit {
  readonly rootId: string;
  /** Size of the folded part (x across, y deep, z high), mm. */
  readonly size: Vec3;
  /** Size of the piece it is placed against, mm. */
  readonly space: Vec3;
  /** space minus size per axis: negative means the part is bigger by that much. */
  readonly slack: Vec3;
  /** True when the part fits completely inside the other piece. */
  readonly fits: boolean;
  /** What "auto" placement would do. */
  readonly auto: "inside" | "closed";
}

/** Whether each extra part would fit inside the piece it is placed against (closed sizes, no placement needed). */
export function partFits(tree: FoldTree): PartFit[] {
  const parts = tree.parts ?? [];
  if (parts.length === 0) return [];
  const sizes = new Map<string, Vec3>();
  const closedPiece = (rootId: string): Vec3 | null => {
    const world = new Map<string, Mat4>();
    try {
      foldPiece(tree, rootId, undefined, 1, world);
    } catch {
      return null;
    }
    const b = boundsOfPanels(tree, world);
    return b ? sizeOf(b) : null;
  };
  for (const r of [tree.rootId, ...parts.map((q) => q.rootId)]) {
    const z = closedPiece(r);
    if (z) sizes.set(r, z);
  }
  const out: PartFit[] = [];
  for (const q of parts) {
    const size = sizes.get(q.rootId);
    const rel = q.placement.relativeTo && q.placement.relativeTo !== q.rootId && sizes.has(q.placement.relativeTo) ? q.placement.relativeTo : tree.rootId;
    const space = sizes.get(rel);
    if (!size || !space) continue;
    const fits = fitsInside(space, size);
    out.push({ rootId: q.rootId, size, space, slack: { x: space.x - size.x, y: space.y - size.y, z: space.z - size.z }, fits, auto: fits ? "inside" : "closed" });
  }
  return out;
}

/** Fold one piece: its root stays at the origin and its panels hang off it. Adds the panels to `world`. */
function foldPiece(tree: FoldTree, rootId: string, hp: Readonly<Record<string, number>> | undefined, p0: number, world: Map<string, Mat4>): void {
  const panelById = new Map(tree.panels.map((p) => [p.id, p]));
  const childrenOf = new Map<string, FoldTree["hinges"][number][]>();
  for (const h of tree.hinges) {
    const list = childrenOf.get(h.parentId) ?? [];
    list.push(h);
    childrenOf.set(h.parentId, list);
  }
  world.set(rootId, IDENTITY);
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parentWorld = world.get(parentId)!;
    for (const h of childrenOf.get(parentId) ?? []) {
      const child = panelById.get(h.childId);
      if (!child) throw new Error(`Hinge "${h.id}" references missing panel "${h.childId}".`);
      if (world.has(child.id)) throw new Error(`Panel "${child.id}" reached twice: fold tree has a cycle.`);

      const dx = h.b.x - h.a.x;
      const dy = h.b.y - h.a.y;
      const len = Math.hypot(dx, dy);
      const u: Vec3 = { x: dx / len, y: dy / len, z: 0 };

      // Which side of the hinge the child lies on decides the rotation sign so
      // the child always moves toward +z (unprinted faces together).
      const cx = child.polygon.reduce((s, q) => s + q.x, 0) / child.polygon.length - h.a.x;
      const cy = child.polygon.reduce((s, q) => s + q.y, 0) / child.polygon.length - h.a.y;
      const side = u.x * cy - u.y * cx;
      if (Math.abs(side) < 1e-9) throw new Error(`Panel "${child.id}" lies on its own hinge line.`);

      const p = hp?.[h.id] ?? p0;
      const angle = Math.sign(side) * p * (h.foldAngleDeg * Math.PI) / 180;
      const local = multiply(translation(h.a.x, h.a.y, 0), multiply(axisAngle(u, angle), translation(-h.a.x, -h.a.y, 0)));
      world.set(child.id, multiply(parentWorld, local));
      queue.push(child.id);
    }
  }
}

/**
 * World transform of every panel. The root panel stays in place; each child is
 * rotated about its hinge (in the flat frame) and then carried along by its
 * parent's transform. Extra parts (tree.parts) are folded on their own (each with its own
 * steps, see foldWindows) and then moved next to, onto or into the piece they are placed
 * against; that move takes the last part of the animation.
 */
export function foldTree(tree: FoldTree, opts: FoldOptions = {}): Map<string, Mat4> {
  const progress = opts.progress ?? 1;
  const parts = tree.parts ?? [];
  // With extra parts the folding itself takes the first 80% and placing them the rest.
  const foldProgress = parts.length > 0 ? Math.min(1, Math.max(0, progress) / (1 - PLACE_SHARE)) : progress;
  const placeT = parts.length > 0 ? Math.min(1, Math.max(0, (progress - (1 - PLACE_SHARE)) / PLACE_SHARE)) : 1;
  const staged = opts.hingeProgress ?? (opts.progress !== undefined ? stagedHingeProgress(tree, foldProgress) : undefined);
  const windows = foldWindows(tree);
  // Progress of one piece when its hinges have no staging of their own: its window of the whole fold.
  const pieceProgress = (rootId: string) => {
    const w = windows.get(rootId) ?? { from: 0, to: 1 };
    return Math.min(1, Math.max(0, (foldProgress - w.from) / (w.to - w.from)));
  };

  const world = new Map<string, Mat4>();
  foldPiece(tree, tree.rootId, staged, pieceProgress(tree.rootId), world);

  if (parts.length > 0) {
    // Each extra part is folded on its own, then moved relative to the CLOSED piece it is placed against.
    const closedMain = new Map<string, Mat4>();
    foldPiece(tree, tree.rootId, undefined, 1, closedMain);
    const finalBounds = new Map<string, Bounds3>();
    const mainBounds = boundsOfPanels(tree, closedMain);
    if (mainBounds) finalBounds.set(tree.rootId, mainBounds);

    const rootIds = new Set([tree.rootId, ...parts.map((q) => q.rootId)]);
    const todo = [...parts];
    let guard = 0;
    while (todo.length > 0 && guard++ < 100) {
      // Next part whose reference piece is already placed (a missing or circular reference means the main body).
      let at = todo.findIndex((q) => !q.placement.relativeTo || q.placement.relativeTo === q.rootId || finalBounds.has(q.placement.relativeTo));
      if (at < 0) at = todo.findIndex((q) => !todo.some((o) => o.rootId === q.placement.relativeTo && o !== q));
      if (at < 0) at = 0;
      const part = todo.splice(at, 1)[0]!;
      const own = new Map<string, Mat4>();
      foldPiece(tree, part.rootId, staged, pieceProgress(part.rootId), own);
      const closedOwn = new Map<string, Mat4>();
      foldPiece(tree, part.rootId, undefined, 1, closedOwn);
      const partBounds = boundsOfPanels(tree, closedOwn);
      const wanted = part.placement.relativeTo;
      const refBounds = (wanted && wanted !== part.rootId ? finalBounds.get(wanted) : undefined) ?? mainBounds;
      let place: Mat4 = IDENTITY;
      if (refBounds && partBounds) {
        const mode = part.placement.mode === "auto" ? (fitsInside(sizeOf(refBounds), sizeOf(partBounds)) ? "inside" : "closed") : part.placement.mode;
        place = placementMatrix(refBounds, partBounds, mode, part.placement, placeT);
        const end = boundsOfPanels(tree, closedOwn, placementMatrix(refBounds, partBounds, mode, part.placement, 1));
        if (end) finalBounds.set(part.rootId, end);
      }
      // The part's starting position: shifted at the start of the move into place, back to zero on arrival.
      const st = part.placement.start;
      let sx = st?.x ?? 0;
      let sy = st?.y ?? 0;
      const sz = st?.z ?? 0;
      if (st?.from) {
        // Start clear of the piece it is placed against, on the chosen side. Measured on the flat sheet, so it holds while the pieces fold.
        const flatBounds = (rootId: string) => {
          const w = new Map<string, Mat4>();
          foldPiece(tree, rootId, undefined, 0, w);
          return boundsOfPanels(tree, w);
        };
        const ref = flatBounds(wanted && wanted !== part.rootId && rootIds.has(wanted) ? wanted : tree.rootId);
        const mine = flatBounds(part.rootId);
        if (ref && mine) {
          const gap = Math.max(10, 0.05 * Math.max(ref.maxX - ref.minX, ref.maxY - ref.minY));
          const rcx = (ref.minX + ref.maxX) / 2, rcy = (ref.minY + ref.maxY) / 2;
          const pcx = (mine.minX + mine.maxX) / 2, pcy = (mine.minY + mine.maxY) / 2;
          if (st.from === "left") { sx += ref.minX - gap - mine.maxX; sy += rcy - pcy; }
          else if (st.from === "right") { sx += ref.maxX + gap - mine.minX; sy += rcy - pcy; }
          else if (st.from === "front") { sx += rcx - pcx; sy += ref.minY - gap - mine.maxY; }
          else { sx += rcx - pcx; sy += ref.maxY + gap - mine.minY; }
        }
      }
      const startShift = st ? translation((1 - placeT) * sx, (1 - placeT) * sy, (1 - placeT) * sz) : IDENTITY;
      for (const [id, m] of own) {
        if (world.has(id)) throw new Error(`Panel "${id}" reached twice: fold tree has a cycle.`);
        world.set(id, multiply(startShift, multiply(place, m)));
      }
    }
  }
  if (world.size !== tree.panels.length) {
    throw new Error(`Fold tree is disconnected: ${tree.panels.length - world.size} panel(s) unreachable from root.`);
  }
  return world;
}
