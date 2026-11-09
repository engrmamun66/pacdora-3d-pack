import type { Vec2 } from "../primitives/vec2";
import type { FoldTree } from "./types";

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
 * Per-hinge progress for a staged fold, or undefined if no hinge has a foldOrder.
 * The distinct fold orders, ascending, are N steps; the hinge in step s (0-based)
 * gets clamp(progress * N - s, 0, 1). Hinges without a foldOrder follow step 0.
 */
export function stagedHingeProgress(tree: FoldTree, progress: number): Record<string, number> | undefined {
  const orders = [...new Set(tree.hinges.map((h) => h.foldOrder).filter((o): o is number => typeof o === "number" && Number.isFinite(o)))].sort((a, b) => a - b);
  if (orders.length === 0) return undefined;
  const stepOf = new Map(orders.map((o, i) => [o, i]));
  const p = Math.min(1, Math.max(0, progress));
  const out: Record<string, number> = {};
  for (const h of tree.hinges) {
    const s = h.foldOrder === undefined ? 0 : (stepOf.get(h.foldOrder) ?? 0);
    out[h.id] = Math.min(1, Math.max(0, p * orders.length - s));
  }
  return out;
}

/**
 * World transform of every panel. The root panel stays in place; each child is
 * rotated about its hinge (in the flat frame) and then carried along by its
 * parent's transform.
 */
export function foldTree(tree: FoldTree, opts: FoldOptions = {}): Map<string, Mat4> {
  const progress = opts.progress ?? 1;
  // Hinges with a foldOrder fold one step after another when only `progress` is given.
  const hingeProgress = opts.hingeProgress ?? (opts.progress !== undefined ? stagedHingeProgress(tree, opts.progress) : undefined);
  const panelById = new Map(tree.panels.map((p) => [p.id, p]));
  const childrenOf = new Map<string, typeof tree.hinges[number][]>();
  for (const h of tree.hinges) {
    const list = childrenOf.get(h.parentId) ?? [];
    list.push(h);
    childrenOf.set(h.parentId, list);
  }

  const world = new Map<string, Mat4>([[tree.rootId, IDENTITY]]);
  const queue = [tree.rootId];
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
      const cx = child.polygon.reduce((s, p) => s + p.x, 0) / child.polygon.length - h.a.x;
      const cy = child.polygon.reduce((s, p) => s + p.y, 0) / child.polygon.length - h.a.y;
      const side = u.x * cy - u.y * cx;
      if (Math.abs(side) < 1e-9) throw new Error(`Panel "${child.id}" lies on its own hinge line.`);

      const p = hingeProgress?.[h.id] ?? progress;
      const angle = Math.sign(side) * p * (h.foldAngleDeg * Math.PI) / 180;
      const local = multiply(translation(h.a.x, h.a.y, 0), multiply(axisAngle(u, angle), translation(-h.a.x, -h.a.y, 0)));
      world.set(child.id, multiply(parentWorld, local));
      queue.push(child.id);
    }
  }
  if (world.size !== tree.panels.length) {
    throw new Error(`Fold tree is disconnected: ${tree.panels.length - world.size} panel(s) unreachable from root.`);
  }
  return world;
}
