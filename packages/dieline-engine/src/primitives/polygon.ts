import ClipperLib from "clipper-lib";
import { type Outline, bulgeAt, bulgeSegmentArea, arcFromBulge, flattenOutline } from "./arc";
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

/** Area (mm2) of a Clipper boolean result; holes count negative. */
function solutionArea(solution: readonly IntPoint[][]): number {
  return solution.reduce((s, path) => s + ClipperLib.Clipper.Area(path as IntPoint[]), 0) / (SCALE * SCALE);
}

function booleanArea(type: number, subjects: readonly (readonly Vec2[])[], clips: readonly (readonly Vec2[])[]): number {
  const c = new ClipperLib.Clipper();
  // Same winding for every input, so NonZero filling treats overlaps as filled.
  const oriented = (p: readonly Vec2[]) => toClipper(signedArea(p) < 0 ? [...p].reverse() : p);
  for (const s of subjects) c.AddPath(oriented(s), ClipperLib.PolyType.ptSubject, true);
  for (const k of clips) c.AddPath(oriented(k), ClipperLib.PolyType.ptClip, true);
  const solution: IntPoint[][] = [];
  c.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return Math.abs(solutionArea(solution));
}

/** Area of the union of polygons (overlaps counted once). */
export const unionArea = (polys: readonly (readonly Vec2[])[]): number =>
  booleanArea(ClipperLib.ClipType.ctUnion, polys, []);

/** Area of the intersection of two polygons. */
export const intersectionArea = (a: readonly Vec2[], b: readonly Vec2[]): number =>
  booleanArea(ClipperLib.ClipType.ctIntersection, [a], [b]);

// ---- Outlines with arc edges (bulges) ----

/** Exact signed area of an outline with arc edges. */
export function outlineSignedArea(o: Outline): number {
  let a = signedArea(o.points);
  const n = o.points.length;
  for (let i = 0; i < n; i++) a += bulgeSegmentArea(o.points[i]!, o.points[(i + 1) % n]!, bulgeAt(o, i));
  return a;
}

export const outlineArea = (o: Outline): number => Math.abs(outlineSignedArea(o));

/** Exact bounds of an outline, including arc extremes between vertices. */
export function outlineBounds(o: Outline): Bounds {
  const pts: Vec2[] = [...o.points];
  const n = o.points.length;
  for (let i = 0; i < n; i++) {
    const bulge = bulgeAt(o, i);
    if (bulge === 0) continue;
    const arc = arcFromBulge(o.points[i]!, o.points[(i + 1) % n]!, bulge);
    // Axis-aligned extremes occur at angles k*pi/2 lying inside the sweep.
    for (let k = -8; k <= 8; k++) {
      const ang = (k * Math.PI) / 2;
      // Normalise by full turns: try the angle shifted by multiples of 2*pi.
      for (const shift of [-4 * Math.PI, -2 * Math.PI, 0, 2 * Math.PI, 4 * Math.PI]) {
        const t = (ang + shift - arc.startAngle) / arc.sweep;
        if (t > 0 && t < 1) pts.push(vec(arc.center.x + arc.radius * Math.cos(ang), arc.center.y + arc.radius * Math.sin(ang)));
      }
    }
  }
  return bounds(pts);
}

/** Offset an outline with arcs (flattened to 5 micrometre tolerance first). */
export function offsetOutline(o: Outline, distance: number, miterLimit = 3): Vec2[][] {
  return offsetPolygon(flattenOutline(o), distance, miterLimit);
}
