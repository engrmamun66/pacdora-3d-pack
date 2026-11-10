import { foldTree } from "../fold-tree/fold3d";
import type { FoldTree } from "../fold-tree/types";
import { vec } from "../primitives/vec2";
import type { FoldSetup } from "./imported-fold";

/** Small geometry helpers shared by fold setup detection and validation (flat x,y,x,y lists). */

/** How far (mm) a hinge line may stray from a panel edge. */
export const HINGE_TOLERANCE = 0.05;

/** Signed shoelace area of a flat x,y,x,y polygon. */
export function flatSignedArea(poly: readonly number[]): number {
  const n = Math.floor(poly.length / 2);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += poly[i * 2]! * poly[j * 2 + 1]! - poly[j * 2]! * poly[i * 2 + 1]!;
  }
  return s / 2;
}

/** Area centroid of a flat polygon (falls back to the vertex mean for a degenerate one). */
export function flatCentroid(poly: readonly number[]): { x: number; y: number } {
  const n = Math.floor(poly.length / 2);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[i * 2]!;
    const y0 = poly[i * 2 + 1]!;
    const x1 = poly[j * 2]!;
    const y1 = poly[j * 2 + 1]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (Math.abs(a) < 1e-12) {
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      mx += poly[i * 2]!;
      my += poly[i * 2 + 1]!;
    }
    return { x: n ? mx / n : 0, y: n ? my / n : 0 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** True if the segment (x1,y1)-(x2,y2) lies within `tol` of ONE edge of the polygon (within that edge's extent). */
export function segmentOnPolygonEdge(
  poly: readonly number[],
  line: readonly [number, number, number, number],
  tol: number = HINGE_TOLERANCE,
): boolean {
  const n = Math.floor(poly.length / 2);
  const [x1, y1, x2, y2] = line;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const px = poly[i * 2]!;
    const py = poly[i * 2 + 1]!;
    const dx = poly[j * 2]! - px;
    const dy = poly[j * 2 + 1]! - py;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len;
    const uy = dy / len;
    let ok = true;
    for (const [qx, qy] of [
      [x1, y1],
      [x2, y2],
    ] as const) {
      const t = (qx - px) * ux + (qy - py) * uy;
      const d = Math.abs((qx - px) * uy - (qy - py) * ux);
      if (d > tol || t < -tol || t > len + tol) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** How tall (mm) one folded piece stands: its panels, hinged from `rootId`, folded closed. 0 if it cannot be folded. */
export function foldedDepth(setup: FoldSetup, rootId: string): number {
  const children = new Map<string, FoldSetup["hinges"][number][]>();
  for (const h of setup.hinges) children.set(h.parentId, [...(children.get(h.parentId) ?? []), h]);
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) {
    for (const h of children.get(queue[i]!) ?? []) {
      if (!ids.has(h.childId)) {
        ids.add(h.childId);
        queue.push(h.childId);
      }
    }
  }
  const tree: FoldTree = {
    rootId,
    panels: setup.panels
      .filter((p) => ids.has(p.id))
      .map((p) => ({ id: p.id, role: p.role, label: p.label, printable: p.printable, polygon: Array.from({ length: p.polygon.length / 2 }, (_, i) => vec(p.polygon[i * 2]!, p.polygon[i * 2 + 1]!)) })),
    hinges: setup.hinges
      .filter((h) => ids.has(h.parentId) && ids.has(h.childId))
      .map((h) => ({ id: h.id, parentId: h.parentId, childId: h.childId, a: vec(h.line[0], h.line[1]), b: vec(h.line[2], h.line[3]), foldAngleDeg: h.angleDeg })),
  };
  try {
    const world = foldTree(tree);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of tree.panels) {
      const m = world.get(p.id)!;
      for (const v of p.polygon) {
        const z = m[2]! * v.x + m[6]! * v.y + m[14]!;
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
    }
    return Number.isFinite(hi - lo) ? hi - lo : 0;
  } catch {
    return 0;
  }
}

/**
 * With several pieces, the deepest one (the box, not its lid) is the main body that the
 * others are placed on. Pieces are exchanged only if another one is clearly deeper.
 */
export function deepestAsMain(setup: FoldSetup): FoldSetup {
  const parts = setup.parts ?? [];
  if (parts.length === 0) return setup;
  const rootIds = [setup.rootId, ...parts.map((p) => p.rootId)];
  const depths = rootIds.map((id) => foldedDepth(setup, id));
  let best = 0;
  for (let i = 1; i < rootIds.length; i++) if (depths[i]! > depths[best]! + 1e-6) best = i;
  if (best === 0) return setup;
  const newParts = parts.map((p, i) => (i === best - 1 ? { ...p, rootId: setup.rootId } : p));
  return { ...setup, rootId: rootIds[best]!, parts: newParts };
}
