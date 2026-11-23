import type { FlatDieline, FlatPath } from "./imported";

/**
 * Fold lines in a drawing often stop short of the cut outline (or of the fold they should meet), or run a little past it.
 * A free end like that makes the line "dangling": it would be dropped and the sheet would stay one panel.
 * `extendFoldLines` makes such a line longer or shorter along its own direction. A line is never moved or turned:
 *  - a free end inside the material grows to the first cut line or fold it meets, if that is within `reach`;
 *  - a free end outside the material is cut back to where the line crosses the cut outline.
 * Ends that already touch a line are left alone. Open cut lines (slits) are never changed.
 */

/** An end this close (mm) to another line already touches it. */
const TOUCH = 0.05;
/** How far an end may grow: a share of the sheet size, clamped (mm). */
const REACH_FRACTION = 0.08;
const REACH_MIN = 5;
const REACH_MAX = 30;
/** Gaps up to this size (a share of the sheet, clamped, mm) are the fold detection's own small-gap joining; they are left to it. */
const SMALL_FRACTION = 0.008;
const SMALL_MIN = 0.3;
const SMALL_MAX = 3;

interface Seg {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** Index of the fold-line path the segment belongs to, or -1 for a cut line. */
  readonly owner: number;
}

export interface ExtendResult {
  readonly flat: FlatDieline;
  /** Fold line ends that grew to meet a line. */
  readonly extended: number;
  /** Fold line ends that were cut back to the outline. */
  readonly trimmed: number;
  /** The longest an end may grow (mm). */
  readonly reach: number;
}

const finite = (p: FlatPath) => p.pts.length >= 4 && p.pts.every((v) => Number.isFinite(v));

function segmentsOf(paths: readonly FlatPath[], owner: (i: number) => number): Seg[] {
  const out: Seg[] = [];
  paths.forEach((p, i) => {
    if (!finite(p)) return;
    const n = p.pts.length / 2;
    const count = p.closed ? n : n - 1;
    for (let k = 0; k < count; k++) {
      const j = (k + 1) % n;
      out.push({ ax: p.pts[2 * k]!, ay: p.pts[2 * k + 1]!, bx: p.pts[2 * j]!, by: p.pts[2 * j + 1]!, owner: owner(i) });
    }
  });
  return out;
}

function distanceToSegment(px: number, py: number, s: Seg): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
}

/** Ray-cast containment in a closed polyline given as flat coordinates. */
function insideLoop(pts: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i]!;
    const yi = pts[2 * i + 1]!;
    const xj = pts[2 * j]!;
    const yj = pts[2 * j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Where the ray from (x, y) along (dx, dy) first meets a segment: the distance, or null. */
function rayHit(x: number, y: number, dx: number, dy: number, segs: readonly Seg[], skip: (s: Seg) => boolean, max: number): number | null {
  let best: number | null = null;
  for (const s of segs) {
    if (skip(s)) continue;
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue; // parallel
    const t = ((s.ax - x) * ey - (s.ay - y) * ex) / den;
    const u = ((s.ax - x) * dy - (s.ay - y) * dx) / den;
    if (t <= TOUCH || t > max || u < -1e-6 || u > 1 + 1e-6) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

export function extendFoldLines(flat: FlatDieline): ExtendResult {
  const cutSegs = segmentsOf(flat.cut, () => -1);
  const loops = flat.cut.filter((p) => p.closed && finite(p));
  const unchanged: ExtendResult = { flat, extended: 0, trimmed: 0, reach: 0 };
  if (cutSegs.length === 0 || flat.crease.length === 0) return unchanged;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of cutSegs) {
    minX = Math.min(minX, s.ax, s.bx);
    minY = Math.min(minY, s.ay, s.by);
    maxX = Math.max(maxX, s.ax, s.bx);
    maxY = Math.max(maxY, s.ay, s.by);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  const reach = Math.min(REACH_MAX, Math.max(REACH_MIN, REACH_FRACTION * size));
  const small = Math.min(SMALL_MAX, Math.max(SMALL_MIN, SMALL_FRACTION * size));
  const creaseSegs = segmentsOf(flat.crease, (i) => i);
  const targets = [...cutSegs, ...creaseSegs];
  const material = (x: number, y: number) => loops.filter((l) => insideLoop(l.pts, x, y)).length % 2 === 1;

  let extended = 0;
  let trimmed = 0;
  const crease = flat.crease.map((p, i): FlatPath => {
    if (p.closed || !finite(p)) return p;
    const pts = [...p.pts];
    const n = pts.length / 2;
    for (const atEnd of [false, true]) {
      const e = atEnd ? n - 1 : 0;
      // The neighbouring point that is not the same as the end (the line's direction comes from it).
      let k = atEnd ? n - 2 : 1;
      while (k >= 0 && k < n && Math.hypot(pts[2 * k]! - pts[2 * e]!, pts[2 * k + 1]! - pts[2 * e + 1]!) < 1e-6) k += atEnd ? -1 : 1;
      if (k < 0 || k >= n) continue;
      const ex = pts[2 * e]!;
      const ey = pts[2 * e + 1]!;
      const px = pts[2 * k]!;
      const py = pts[2 * k + 1]!;
      const len = Math.hypot(ex - px, ey - py);
      const dx = (ex - px) / len;
      const dy = (ey - py) / len;
      const mine = (s: Seg) => s.owner === i;
      if (targets.some((s) => !mine(s) && distanceToSegment(ex, ey, s) <= TOUCH)) continue; // already touches a line
      if (!material(ex, ey)) {
        // Past the outline: cut it back to where it crosses a cut line (the crossing nearest to the end).
        let u: number | null = null;
        for (const s of cutSegs) {
          const sx = s.bx - s.ax;
          const sy = s.by - s.ay;
          const den = (ex - px) * sy - (ey - py) * sx;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((s.ax - px) * sy - (s.ay - py) * sx) / den;
          const v = ((s.ax - px) * (ey - py) - (s.ay - py) * (ex - px)) / den;
          if (t < 1e-6 || t >= 1 - 1e-9 || v < -1e-6 || v > 1 + 1e-6) continue;
          if (u === null || t > u) u = t;
        }
        if (u !== null) {
          pts[2 * e] = px + (ex - px) * u;
          pts[2 * e + 1] = py + (ey - py) * u;
          trimmed++;
        }
        continue;
      }
      const t = rayHit(ex, ey, dx, dy, targets, mine, reach);
      if (t === null || t <= small) continue;
      pts[2 * e] = ex + dx * t;
      pts[2 * e + 1] = ey + dy * t;
      extended++;
    }
    return { pts, closed: false };
  });
  if (extended === 0 && trimmed === 0) return unchanged;
  return { flat: { ...flat, crease }, extended, trimmed, reach };
}
