/** Pure helpers of the window editor: how far a window is from the edges of its panel, and alignment guides while it moves. */

export interface P {
  x: number;
  y: number;
}
export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function boxOf(pts: readonly P[]): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/** Ray casting: is the point inside the polygon? */
export function pointIn(p: P, poly: readonly P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Where the polygon's outline crosses the horizontal line `y` (x values). */
function crossX(poly: readonly P[], y: number): number[] {
  const out: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y) out.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  return out;
}
/** Where the polygon's outline crosses the vertical line `x` (y values). */
function crossY(poly: readonly P[], x: number): number[] {
  const out: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.x > x !== b.x > x) out.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return out;
}

export interface Gaps {
  /** From the panel's left edge (or fold) to the window, measured along the window's middle. */
  left?: { from: number; to: number; y: number };
  /** From the panel's top edge (or fold) down to the window. */
  top?: { from: number; to: number; x: number };
}

/** Distances from the window (its outline `win`) to the left and top edge of the panel (`panel` outline) it lies in. */
export function windowGaps(panel: readonly P[], win: readonly P[]): Gaps {
  const b = boxOf(win);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const gaps: Gaps = {};
  const xs = crossX(panel, cy).filter((x) => x <= b.minX + 1e-6);
  if (xs.length) gaps.left = { from: Math.max(...xs), to: b.minX, y: cy };
  const ys = crossY(panel, cx).filter((y) => y <= b.minY + 1e-6);
  if (ys.length) gaps.top = { from: Math.max(...ys), to: b.minY, x: cx };
  return gaps;
}

const xs3 = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX];
const ys3 = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY];

/**
 * Snap a moving window to the others: its left / middle / right line to theirs (and the middle of its panel), the same
 * for top / middle / bottom, when closer than `thr` mm. Returns the shift to apply and the guide lines that now line up.
 */
export function snapMove(moving: Box, others: readonly Box[], panel: Box | null, thr: number): { dx: number; dy: number; guides: Guide[] } {
  const targets = (pick: (b: Box) => number[], panelPick: (b: Box) => number) => {
    const t: { v: number; from: Box | null }[] = [];
    for (const o of others) for (const v of pick(o)) t.push({ v, from: o });
    if (panel) t.push({ v: panelPick(panel), from: null });
    return t;
  };
  const best = (mine: number[], t: { v: number }[]) => {
    let d = 0;
    let min = thr;
    for (const m of mine) for (const x of t) if (Math.abs(x.v - m) < min) { min = Math.abs(x.v - m); d = x.v - m; }
    return min < thr ? d : 0;
  };
  const tx = targets(xs3, (b) => (b.minX + b.maxX) / 2);
  const dx = best(xs3(moving), tx);
  const ty = targets(ys3, (b) => (b.minY + b.maxY) / 2);
  const dy = best(ys3(moving), ty);
  const m: Box = { minX: moving.minX + dx, maxX: moving.maxX + dx, minY: moving.minY + dy, maxY: moving.maxY + dy };
  const guides: Guide[] = [];
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (const x of tx) {
    if (!xs3(m).some((v) => eq(v, x.v))) continue;
    const s = x.from ?? panel!;
    guides.push({ x1: x.v, x2: x.v, y1: Math.min(m.minY, s.minY), y2: Math.max(m.maxY, s.maxY) });
  }
  for (const y of ty) {
    if (!ys3(m).some((v) => eq(v, y.v))) continue;
    const s = y.from ?? panel!;
    guides.push({ y1: y.v, y2: y.v, x1: Math.min(m.minX, s.minX), x2: Math.max(m.maxX, s.maxX) });
  }
  return { dx, dy, guides };
}
