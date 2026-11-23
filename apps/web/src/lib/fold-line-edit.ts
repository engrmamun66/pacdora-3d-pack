/**
 * Making a fold line longer or shorter, for the "Edit fold lines" tool. A line is never moved or turned: an end only slides
 * along the direction the line already has, so the other end and the line's angle stay as they are.
 */

export type Pts = readonly number[];
export type End = "start" | "end";

/** A straight piece of some other line (a cut edge or another fold) that an end can be snapped or extended to. */
export interface TargetSeg {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** The straight pieces of polylines (closed ones also have the closing piece). */
export function segmentsOf(paths: readonly { pts: Pts; closed?: boolean }[]): TargetSeg[] {
  const out: TargetSeg[] = [];
  for (const p of paths) {
    const n = Math.floor(p.pts.length / 2);
    const count = p.closed ? n : n - 1;
    for (let k = 0; k < count; k++) {
      const j = (k + 1) % n;
      out.push({ ax: p.pts[2 * k]!, ay: p.pts[2 * k + 1]!, bx: p.pts[2 * j]!, by: p.pts[2 * j + 1]! });
    }
  }
  return out;
}

/** The end as an anchor (the neighbouring point that stays), the end itself and the unit direction from one to the other. */
function frame(pts: Pts, end: End) {
  const n = pts.length / 2;
  const e = end === "end" ? n - 1 : 0;
  const step = end === "end" ? -1 : 1;
  let k = e + step;
  while (k >= 0 && k < n && Math.hypot(pts[2 * k]! - pts[2 * e]!, pts[2 * k + 1]! - pts[2 * e + 1]!) < 1e-9) k += step;
  if (k < 0 || k >= n) return null;
  const px = pts[2 * k]!;
  const py = pts[2 * k + 1]!;
  const len = Math.hypot(pts[2 * e]! - px, pts[2 * e + 1]! - py);
  return { e, px, py, dx: (pts[2 * e]! - px) / len, dy: (pts[2 * e + 1]! - py) / len, len };
}

const withEnd = (pts: Pts, e: number, x: number, y: number): number[] => {
  const out = [...pts];
  out[2 * e] = x;
  out[2 * e + 1] = y;
  return out;
};

/** Distances from (x, y) along (dx, dy) at which the ray meets a segment, nearest first. */
function hits(x: number, y: number, dx: number, dy: number, segs: readonly TargetSeg[]): number[] {
  const out: number[] = [];
  for (const s of segs) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue; // parallel
    const t = ((s.ax - x) * ey - (s.ay - y) * ex) / den;
    const u = ((s.ax - x) * dy - (s.ay - y) * dx) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** Length (mm) of the line. */
export function lengthOf(pts: Pts): number {
  let sum = 0;
  for (let i = 2; i < pts.length; i += 2) sum += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
  return sum;
}

/**
 * Drag one end of a line to where the pointer is, but only along the line's own direction. It never turns, never goes
 * back past its neighbouring point (a line keeps at least `minLength` mm), and it snaps to the first cut edge or fold the
 * line meets when the pointer is within `snap` mm of that spot.
 */
export function dragEnd(pts: Pts, end: End, pointer: { x: number; y: number }, targets: readonly TargetSeg[], snap: number, minLength = 1): number[] {
  const f = frame(pts, end);
  if (!f) return [...pts];
  let t = (pointer.x - f.px) * f.dx + (pointer.y - f.py) * f.dy;
  for (const h of hits(f.px, f.py, f.dx, f.dy, targets)) {
    if (Math.abs(h - t) <= snap) {
      t = h;
      break;
    }
  }
  t = Math.max(minLength, t);
  return withEnd(pts, f.e, f.px + f.dx * t, f.py + f.dy * t);
}

/** Make the end reach the first cut edge or fold beyond it, along the line's own direction. Null when nothing is ahead. */
export function extendEnd(pts: Pts, end: End, targets: readonly TargetSeg[]): number[] | null {
  const f = frame(pts, end);
  if (!f) return null;
  const ahead = hits(pts[2 * f.e]!, pts[2 * f.e + 1]!, f.dx, f.dy, targets).find((t) => t > 1e-3);
  if (ahead === undefined) return null;
  return withEnd(pts, f.e, pts[2 * f.e]! + f.dx * ahead, pts[2 * f.e + 1]! + f.dy * ahead);
}
