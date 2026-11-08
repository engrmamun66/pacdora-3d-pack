import { type Outline, arcFromBulge, bulgeAt } from "@packaging/dieline-engine";
import type { Matrix, PathCmd } from "./types";

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 · m2 (apply m2 first). */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
/** Clockwise on screen (y down), degrees, like the editor. */
export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export const apply = (m: Matrix, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

export function transformPath(d: readonly PathCmd[], m: Matrix): PathCmd[] {
  return d.map((c) => {
    if (c.op === "Z") return c;
    if (c.op === "C") {
      const p1 = apply(m, c.x1, c.y1);
      const p2 = apply(m, c.x2, c.y2);
      const p = apply(m, c.x, c.y);
      return { op: "C", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
    }
    const p = apply(m, c.x, c.y);
    return { op: c.op, x: p.x, y: p.y };
  });
}

/** Circular arc from a to b given as a bulge, as cubic Béziers (max 90° each; error < 0.03% of radius). */
function arcCubics(ax: number, ay: number, bx: number, by: number, bulge: number): PathCmd[] {
  const arc = arcFromBulge({ x: ax, y: ay }, { x: bx, y: by }, bulge);
  const n = Math.max(1, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 2) - 1e-9));
  const step = arc.sweep / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: PathCmd[] = [];
  const { center: c, radius: r } = arc;
  for (let i = 0; i < n; i++) {
    const t0 = arc.startAngle + step * i;
    const t1 = t0 + step;
    const p0 = { x: c.x + r * Math.cos(t0), y: c.y + r * Math.sin(t0) };
    const p3 = i === n - 1 ? { x: bx, y: by } : { x: c.x + r * Math.cos(t1), y: c.y + r * Math.sin(t1) };
    out.push({
      op: "C",
      x1: p0.x - k * r * Math.sin(t0),
      y1: p0.y + k * r * Math.cos(t0),
      x2: p3.x + k * r * Math.sin(t1),
      y2: p3.y - k * r * Math.cos(t1),
      x: p3.x,
      y: p3.y,
    });
  }
  return out;
}

/** Closed outline (straight edges + arcs) as path commands. */
export function outlinePath(o: Outline): PathCmd[] {
  const pts = o.points;
  const out: PathCmd[] = [{ op: "M", x: pts[0]!.x, y: pts[0]!.y }];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const bulge = bulgeAt(o, i);
    if (bulge !== 0) out.push(...arcCubics(a.x, a.y, b.x, b.y, bulge));
    else if (i < pts.length - 1) out.push({ op: "L", x: b.x, y: b.y });
  }
  out.push({ op: "Z" });
  return out;
}

export function polygonPath(pts: readonly { x: number; y: number }[]): PathCmd[] {
  return [...pts.map((p, i) => ({ op: i === 0 ? "M" : "L", x: p.x, y: p.y }) as PathCmd), { op: "Z" }];
}

export const linePath = (ax: number, ay: number, bx: number, by: number): PathCmd[] => [
  { op: "M", x: ax, y: ay },
  { op: "L", x: bx, y: by },
];

const KAPPA = (4 / 3) * (Math.SQRT2 - 1);

/** Ellipse centred on (0, 0). */
export function ellipsePath(rx: number, ry: number): PathCmd[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { op: "M", x: rx, y: 0 },
    { op: "C", x1: rx, y1: ky, x2: kx, y2: ry, x: 0, y: ry },
    { op: "C", x1: -kx, y1: ry, x2: -rx, y2: ky, x: -rx, y: 0 },
    { op: "C", x1: -rx, y1: -ky, x2: -kx, y2: -ry, x: 0, y: -ry },
    { op: "C", x1: kx, y1: -ry, x2: rx, y2: -ky, x: rx, y: 0 },
    { op: "Z" },
  ];
}

/** Rectangle centred on (0, 0) with optional corner radius (clamped like the editor's canvas). */
export function rectPath(w: number, h: number, radius: number): PathCmd[] {
  const x0 = -w / 2;
  const y0 = -h / 2;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return polygonPath([{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }]);
  const k = r * KAPPA;
  const x1 = x0 + w;
  const y1 = y0 + h;
  return [
    { op: "M", x: x0 + r, y: y0 },
    { op: "L", x: x1 - r, y: y0 },
    { op: "C", x1: x1 - r + k, y1: y0, x2: x1, y2: y0 + r - k, x: x1, y: y0 + r },
    { op: "L", x: x1, y: y1 - r },
    { op: "C", x1: x1, y1: y1 - r + k, x2: x1 - r + k, y2: y1, x: x1 - r, y: y1 },
    { op: "L", x: x0 + r, y: y1 },
    { op: "C", x1: x0 + r - k, y1: y1, x2: x0, y2: y1 - r + k, x: x0, y: y1 - r },
    { op: "L", x: x0, y: y0 + r },
    { op: "C", x1: x0, y1: y0 + r - k, x2: x0 + r - k, y2: y0, x: x0 + r, y: y0 },
    { op: "Z" },
  ];
}

/** Bounds of path end points and control points (a safe outer bound). */
export function pathBounds(d: readonly PathCmd[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const c of d) {
    if (c.op === "Z") continue;
    if (c.op === "C") {
      add(c.x1, c.y1);
      add(c.x2, c.y2);
    }
    add(c.x, c.y);
  }
  return { minX, minY, maxX, maxY };
}
