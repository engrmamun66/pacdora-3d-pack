/**
 * The pen tool of the window editor, built like the pen tool of a drawing program: a path is a list of anchors; a click
 * makes a corner, a click and drag makes a smooth anchor with two handles (curves follow the handles); the path closes
 * on its first anchor. Pure functions on plain data, in the sheet's frame (mm).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Anchor {
  x: number;
  y: number;
  /** Handle on the side of the previous anchor, and on the side of the next one (absolute points). Null = none. */
  hin: Pt | null;
  hout: Pt | null;
  /** The two handles stay in one line (moving one turns the other). */
  smooth: boolean;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

export const cornerAnchor = (p: Pt): Anchor => ({ x: p.x, y: p.y, hin: null, hout: null, smooth: false });

/** Segments of the path as pairs of anchor indexes (the last one goes back to the first when closed). */
export function segments(n: number, closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
  if (closed && n >= 2) out.push([n - 1, 0]);
  return out;
}

/** The four points of the curve between two anchors (a straight line has its handles on its ends). */
export function curveOf(a: Anchor, b: Anchor): [Pt, Pt, Pt, Pt] {
  return [{ x: a.x, y: a.y }, a.hout ?? { x: a.x, y: a.y }, b.hin ?? { x: b.x, y: b.y }, { x: b.x, y: b.y }];
}
const isStraight = (a: Anchor, b: Anchor) => !a.hout && !b.hin;

const at = ([p0, c1, c2, p1]: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
};

/** SVG path data. `rubber` adds a segment from the last anchor to the pointer while the path is still open. */
export function pathData(anchors: readonly Anchor[], closed: boolean, rubber?: Pt | null): string {
  if (anchors.length === 0) return "";
  const f = (n: number) => +n.toFixed(3);
  let d = `M${f(anchors[0]!.x)} ${f(anchors[0]!.y)}`;
  for (const [i, j] of segments(anchors.length, closed)) {
    const [, c1, c2, p1] = curveOf(anchors[i]!, anchors[j]!);
    d += isStraight(anchors[i]!, anchors[j]!) ? `L${f(p1.x)} ${f(p1.y)}` : `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p1.x)} ${f(p1.y)}`;
  }
  if (!closed && rubber) {
    const last = anchors[anchors.length - 1]!;
    d += last.hout ? `C${f(last.hout.x)} ${f(last.hout.y)} ${f(rubber.x)} ${f(rubber.y)} ${f(rubber.x)} ${f(rubber.y)}` : `L${f(rubber.x)} ${f(rubber.y)}`;
  }
  return closed ? `${d}Z` : d;
}

/** The path as a polygon (curves cut into short straight pieces). At most about `maxPoints` points. */
export function flattenPath(anchors: readonly Anchor[], closed: boolean, maxPoints = 1200): Pt[] {
  const build = (scale: number) => {
    const out: Pt[] = [];
    for (const [i, j] of segments(anchors.length, closed)) {
      const a = anchors[i]!;
      const b = anchors[j]!;
      out.push({ x: a.x, y: a.y });
      if (isStraight(a, b)) continue;
      const c = curveOf(a, b);
      const length = dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]);
      const steps = Math.max(6, Math.min(60, Math.ceil((length / 1.2) * scale)));
      for (let k = 1; k < steps; k++) out.push(at(c, k / steps));
    }
    if (!closed && anchors.length > 0) out.push({ x: anchors[anchors.length - 1]!.x, y: anchors[anchors.length - 1]!.y });
    return out.filter((p, k) => k === 0 || !same(p, out[k - 1]!));
  };
  let scale = 1;
  let pts = build(scale);
  while (pts.length > maxPoints && scale > 0.05) {
    scale /= 2;
    pts = build(scale);
  }
  return pts;
}

/** The point of the path nearest to `p`: which segment, how far along it (0..1), where, and how far away. */
export function nearestOnPath(anchors: readonly Anchor[], closed: boolean, p: Pt): { seg: number; t: number; point: Pt; distance: number } | null {
  let best: { seg: number; t: number; point: Pt; distance: number } | null = null;
  segments(anchors.length, closed).forEach(([i, j], seg) => {
    const c = curveOf(anchors[i]!, anchors[j]!);
    const steps = 32;
    let prev = c[0];
    for (let k = 1; k <= steps; k++) {
      const cur = at(c, k / steps);
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const len2 = dx * dx + dy * dy;
      const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - prev.x) * dx + (p.y - prev.y) * dy) / len2));
      const q = { x: prev.x + dx * u, y: prev.y + dy * u };
      const d = dist(p, q);
      if (!best || d < best.distance) best = { seg, t: (k - 1 + u) / steps, point: q, distance: d };
      prev = cur;
    }
  });
  return best;
}

/** A new anchor on segment `seg` at `t`; the curve keeps exactly its shape (de Casteljau). */
export function insertAnchor(anchors: readonly Anchor[], closed: boolean, seg: number, t: number): Anchor[] {
  const pair = segments(anchors.length, closed)[seg];
  if (!pair) return [...anchors];
  const [i, j] = pair;
  const a = anchors[i]!;
  const b = anchors[j]!;
  const next = anchors.map((x) => ({ ...x }));
  if (isStraight(a, b)) {
    const p = lerp({ x: a.x, y: a.y }, { x: b.x, y: b.y }, t);
    next.splice(i + 1, 0, cornerAnchor(p));
    return next;
  }
  const [p0, c1, c2, p1] = curveOf(a, b);
  const q0 = lerp(p0, c1, t);
  const q1 = lerp(c1, c2, t);
  const q2 = lerp(c2, p1, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  const fresh: Anchor = { x: s.x, y: s.y, hin: r0, hout: r1, smooth: true };
  next[i] = { ...next[i]!, hout: a.hout ? q0 : null };
  next[j] = { ...next[j]!, hin: b.hin ? q2 : null };
  // The closing segment (last -> first) puts the new anchor at the end.
  next.splice(j === 0 ? next.length : i + 1, 0, fresh);
  return next;
}

/** Move a handle. A smooth anchor turns its other handle to stay in line (keeping its length), unless `breakSmooth`. */
export function setHandle(anchors: readonly Anchor[], i: number, which: "hin" | "hout", to: Pt, breakSmooth = false): Anchor[] {
  const next = anchors.map((x) => ({ ...x }));
  const a = next[i];
  if (!a) return next;
  a[which] = to;
  const other = which === "hin" ? "hout" : "hin";
  if (breakSmooth) a.smooth = false;
  else if (a.smooth && a[other]) {
    const len = dist(a, a[other]!);
    const d = dist(a, to);
    if (d > 1e-9) a[other] = { x: a.x - ((to.x - a.x) / d) * len, y: a.y - ((to.y - a.y) / d) * len };
  }
  return next;
}

/** Move an anchor with its handles. */
export function moveAnchor(anchors: readonly Anchor[], i: number, to: Pt): Anchor[] {
  const a = anchors[i];
  if (!a) return [...anchors];
  const dx = to.x - a.x;
  const dy = to.y - a.y;
  const shift = (h: Pt | null) => (h ? { x: h.x + dx, y: h.y + dy } : null);
  return anchors.map((x, k) => (k === i ? { ...x, x: to.x, y: to.y, hin: shift(x.hin), hout: shift(x.hout) } : x));
}

/** Corner <-> smooth: a corner gets handles along the line between its neighbours, a smooth anchor loses them. */
export function toggleSmooth(anchors: readonly Anchor[], closed: boolean, i: number): Anchor[] {
  const a = anchors[i];
  if (!a) return [...anchors];
  if (a.hin || a.hout) return anchors.map((x, k) => (k === i ? { ...x, hin: null, hout: null, smooth: false } : x));
  const n = anchors.length;
  const prev = anchors[i - 1] ?? (closed ? anchors[n - 1] : undefined) ?? a;
  const nextA = anchors[i + 1] ?? (closed ? anchors[0] : undefined) ?? a;
  let dx = nextA.x - prev.x;
  let dy = nextA.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [...anchors];
  dx /= len;
  dy /= len;
  const reach = Math.min(dist(a, prev) || len, dist(a, nextA) || len) / 3;
  return anchors.map((x, k) => (k === i ? { ...x, hin: { x: a.x - dx * reach, y: a.y - dy * reach }, hout: { x: a.x + dx * reach, y: a.y + dy * reach }, smooth: true } : x));
}

/** Round a direction to a multiple of 45 degrees (Shift). */
export function snap45(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}
