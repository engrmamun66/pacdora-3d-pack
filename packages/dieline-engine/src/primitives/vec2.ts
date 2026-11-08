/**
 * 2D vector primitives. Coordinates are millimetres, y axis points DOWN
 * (same as SVG / canvas). Renderers that need y-up (PDF) flip at output time.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Geometric tolerance in mm used for equality checks. */
export const EPS = 1e-6;

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));
export const nearlyEqual = (a: Vec2, b: Vec2, eps = EPS): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
