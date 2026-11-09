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
