import ClipperLib from "clipper-lib";
import { type Vec2, vec } from "./vec2";

/** Clipper works on integers; 1 mm = 10_000 units (0.1 micrometre). */
const SCALE = 10_000;

export interface Bounds {
  readonly min: Vec2;
  readonly max: Vec2;
}

/** Shoelace signed area. Sign depends on winding; use Math.abs for size. */
export function signedArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export const area = (poly: readonly Vec2[]): number => Math.abs(signedArea(poly));

export function bounds(points: readonly Vec2[]): Bounds {
  if (points.length === 0) throw new Error("bounds(): empty point list");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: vec(minX, minY), max: vec(maxX, maxY) };
}

/** Remove consecutive duplicate points and vertices lying on a straight line. */
export function simplifyCollinear(poly: readonly Vec2[], eps = 1e-9): Vec2[] {
  let pts = [...poly];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length]!;
      const cur = pts[i]!;
      const next = pts[(i + 1) % pts.length]!;
      const cr = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
      const same = Math.hypot(cur.x - prev.x, cur.y - prev.y) < eps;
      if (same || Math.abs(cr) < eps) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

type IntPoint = { X: number; Y: number };

const toClipper = (poly: readonly Vec2[]): IntPoint[] =>
  poly.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));

const fromClipper = (path: readonly IntPoint[]): Vec2[] => path.map((p) => vec(p.X / SCALE, p.Y / SCALE));

/**
 * Offset a closed polygon by `distance` mm (positive = grow, negative = shrink)
 * with mitered corners. Uses Clipper (v6 port, Boost licence), so notches
 * narrower than 2*distance are merged instead of producing self-intersecting
 * output (needed for bleed around narrow slits between flaps). May return
 * several polygons if the shape splits.
 *
 * Note: clipper2-js 1.2.4 was tried first and returned wrong geometry even for
 * a plain square, so it is NOT used.
 */
export function offsetPolygon(poly: readonly Vec2[], distance: number, miterLimit = 3): Vec2[][] {
  const co = new ClipperLib.ClipperOffset(miterLimit, 0.25 * SCALE);
  co.AddPath(toClipper(poly), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solution: IntPoint[][] = [];
  co.Execute(solution, distance * SCALE);
  return solution.map(fromClipper);
}
