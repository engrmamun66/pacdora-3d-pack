import { type Vec2, vec } from "./vec2";

/**
 * Edges with "bulge" (DXF convention). Each closed outline is a list of
 * vertices plus one bulge per edge (edge i goes from vertex i to vertex i+1).
 *
 *   bulge = tan(sweep / 4)      0 = straight line
 *
 * Sign (purely algebraic, independent of axis display): for an edge a->b with
 * direction d = b - a, a POSITIVE bulge puts the arc's midpoint on the side of
 * the vector (d.y, -d.x); negative puts it on the opposite side.
 * |bulge| = 1 is a semicircle. Reversing an edge negates its bulge.
 */

export interface ArcGeometry {
  readonly center: Vec2;
  readonly radius: number;
  /** Angle (radians) of the start point a around the centre. */
  readonly startAngle: number;
  /** Signed sweep from a to b (radians). */
  readonly sweep: number;
  /** Arc midpoint. */
  readonly mid: Vec2;
}

/** Bulge for a circular arc of radius r on a chord of length c (minor arc), with sign. */
export function bulgeFromRadius(chord: number, radius: number, sign: 1 | -1): number {
  if (radius < chord / 2 - 1e-12) throw new Error(`Radius ${radius} too small for chord ${chord}.`);
  const half = Math.asin(Math.min(1, chord / (2 * radius))); // half the sweep
  return sign * Math.tan(half / 2);
}

export function arcFromBulge(a: Vec2, b: Vec2, bulge: number): ArcGeometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = Math.hypot(dx, dy);
  if (c === 0 || bulge === 0) throw new Error("arcFromBulge: degenerate edge or zero bulge.");
  const px = dy / c; // unit vector on the positive-bulge side
  const py = -dx / c;
  const s = (bulge * c) / 2; // signed sagitta
  const r = (c * c) / 4 / (2 * Math.abs(s)) + Math.abs(s) / 2;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mid = vec(mx + px * s, my + py * s);
  const center = vec(mid.x - px * Math.sign(s) * r, mid.y - py * Math.sign(s) * r);
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const magnitude = 4 * Math.atan(Math.abs(bulge));
  // Pick the sweep direction that passes through the arc midpoint.
  const probe = (sw: number) => {
    const t = startAngle + sw / 2;
    return Math.hypot(center.x + r * Math.cos(t) - mid.x, center.y + r * Math.sin(t) - mid.y);
  };
  const sweep = probe(magnitude) <= probe(-magnitude) ? magnitude : -magnitude;
  return { center, radius: r, startAngle, sweep, mid };
}

/** Signed area between chord and arc, to be ADDED to the shoelace area of the vertices. */
export function bulgeSegmentArea(a: Vec2, b: Vec2, bulge: number): number {
  if (bulge === 0) return 0;
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  const theta = 4 * Math.atan(Math.abs(bulge));
  const r = c / (2 * Math.sin(theta / 2));
  const segment = (r * r * (theta - Math.sin(theta))) / 2;
  return Math.sign(bulge) * segment;
}

/** Arc length of an edge (chord length when straight). */
export function edgeLength(a: Vec2, b: Vec2, bulge: number): number {
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  if (bulge === 0) return c;
  const theta = 4 * Math.atan(Math.abs(bulge));
  return (c / (2 * Math.sin(theta / 2))) * theta;
}

/**
 * Points along an edge, EXCLUDING a and INCLUDING b, such that the polyline
 * deviates from the true arc by at most `tolerance` mm.
 */
export function flattenEdge(a: Vec2, b: Vec2, bulge: number, tolerance = 0.005): Vec2[] {
  if (bulge === 0) return [b];
  const arc = arcFromBulge(a, b, bulge);
  // Chord error for step angle phi: r(1 - cos(phi/2)) <= tol
  const maxStep = 2 * Math.acos(Math.max(-1, 1 - tolerance / arc.radius));
  const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / maxStep));
  const pts: Vec2[] = [];
  for (let i = 1; i < n; i++) {
    const t = arc.startAngle + (arc.sweep * i) / n;
    pts.push(vec(arc.center.x + arc.radius * Math.cos(t), arc.center.y + arc.radius * Math.sin(t)));
  }
  pts.push(b);
  return pts;
}

/** A closed outline with optional per-edge bulges. */
export interface Outline {
  readonly points: readonly Vec2[];
  /** Same length as points; missing means all straight. */
  readonly bulges?: readonly number[];
}

export const bulgeAt = (o: Outline, i: number): number => o.bulges?.[i] ?? 0;

/** Flatten a closed outline (with arcs) into a plain polygon. */
export function flattenOutline(o: Outline, tolerance = 0.005): Vec2[] {
  const out: Vec2[] = [];
  const n = o.points.length;
  for (let i = 0; i < n; i++) {
    const a = o.points[i]!;
    const b = o.points[(i + 1) % n]!;
    if (i === 0) out.push(a);
    const seg = flattenEdge(a, b, bulgeAt(o, i), tolerance);
    // The last edge returns to the first point; drop the duplicate.
    out.push(...(i === n - 1 ? seg.slice(0, -1) : seg));
  }
  return out;
}

/**
 * Replace selected polygon corners with tangent circular fillets.
 * `radii[i]` is the fillet radius at vertex i (0 = keep sharp).
 * Throws if a fillet does not fit on its adjacent edges.
 */
export function roundCorners(points: readonly Vec2[], radii: readonly number[]): { points: Vec2[]; bulges: number[] } {
  const n = points.length;
  const tangent: number[] = new Array(n).fill(0);
  const unit = (x: number, y: number) => {
    const l = Math.hypot(x, y);
    return vec(x / l, y / l);
  };
  for (let i = 0; i < n; i++) {
    const r = radii[i] ?? 0;
    if (r <= 0) continue;
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const u1 = unit(p0.x - p1.x, p0.y - p1.y);
    const u2 = unit(p2.x - p1.x, p2.y - p1.y);
    const phi = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    if (phi < 1e-6 || Math.PI - phi < 1e-6) throw new Error(`Cannot round a degenerate corner at vertex ${i}.`);
    tangent[i] = r / Math.tan(phi / 2);
  }
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (tangent[i]! + tangent[(i + 1) % n]! > len + 1e-9) {
      throw new Error(`Corner radius too large: fillets do not fit on edge ${i} (length ${len.toFixed(3)} mm).`);
    }
  }

  const outP: Vec2[] = [];
  const outB: number[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i]!;
    const t = tangent[i]!;
    if (t === 0) {
      outP.push(p1);
      outB.push(0);
      continue;
    }
    const p0 = points[(i - 1 + n) % n]!;
    const p2 = points[(i + 1) % n]!;
    const u1 = unit(p0.x - p1.x, p0.y - p1.y);
    const u2 = unit(p2.x - p1.x, p2.y - p1.y);
    const t1 = vec(p1.x + u1.x * t, p1.y + u1.y * t);
    const t2 = vec(p1.x + u2.x * t, p1.y + u2.y * t);
    const phi = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    const magnitude = Math.tan((Math.PI - phi) / 4);
    // The fillet bulges toward the original corner.
    const dx = t2.x - t1.x;
    const dy = t2.y - t1.y;
    const towardCorner = dy * (p1.x - (t1.x + t2.x) / 2) - dx * (p1.y - (t1.y + t2.y) / 2);
    outP.push(t1, t2);
    outB.push(Math.sign(towardCorner) * magnitude, 0);
  }
  // Remove zero-length straight edges created when two fillets meet exactly.
  const P: Vec2[] = [];
  const B: number[] = [];
  for (let i = 0; i < outP.length; i++) {
    const next = outP[(i + 1) % outP.length]!;
    const cur = outP[i]!;
    if (outB[i] === 0 && Math.hypot(next.x - cur.x, next.y - cur.y) < 1e-9) continue;
    P.push(cur);
    B.push(outB[i]!);
  }
  return { points: P, bulges: B };
}
