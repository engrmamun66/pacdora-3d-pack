import { SvgImportError } from "./types";

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** a * b: b is applied first. */
export function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const translateM = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scaleM = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0];

const finiteMat = (m: Mat) => m.every(Number.isFinite);

/** Largest axis stretch of a matrix: used to turn a mm tolerance into user units. */
export const maxScale = (m: Mat) => Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
/** Area scale root: how much a stroke width grows. */
export const areaScale = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// ---- number scanning -------------------------------------------------------

/** End index of the last scanNumber call. Module state keeps the hot path allocation-free. */
let scanPos = 0;
export const lastScanEnd = () => scanPos;

const isDigit = (c: number) => c >= 48 && c <= 57;

/** Reads one SVG number starting exactly at `start`; NaN when there is none. */
export function scanNumber(s: string, start: number): number {
  const n = s.length;
  let i = start;
  let c = s.charCodeAt(i);
  if (c === 43 || c === 45) i++;
  let digits = 0;
  while (i < n && isDigit(s.charCodeAt(i))) {
    i++;
    digits++;
  }
  if (s.charCodeAt(i) === 46) {
    i++;
    while (i < n && isDigit(s.charCodeAt(i))) {
      i++;
      digits++;
    }
  }
  if (digits === 0) {
    scanPos = start;
    return NaN;
  }
  c = s.charCodeAt(i);
  if (c === 101 || c === 69) {
    let j = i + 1;
    const sg = s.charCodeAt(j);
    if (sg === 43 || sg === 45) j++;
    if (isDigit(s.charCodeAt(j))) {
      while (j < n && isDigit(s.charCodeAt(j))) j++;
      i = j;
    }
  }
  scanPos = i;
  const v = Number(s.slice(start, i));
  return Number.isFinite(v) ? v : NaN;
}

/** Skips whitespace and commas. */
export function skipSep(s: string, i: number): number {
  for (;;) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 44 || c === 9 || c === 10 || c === 13 || c === 12) i++;
    else return i;
  }
}

/** Parses "x,y x,y ..." for polyline/polygon. Stops at the first malformed token. */
export function parsePoints(s: string): number[] {
  const out: number[] = [];
  let i = skipSep(s, 0);
  while (i < s.length) {
    const v = scanNumber(s, i);
    if (Number.isNaN(v)) break;
    out.push(v);
    i = skipSep(s, scanPos);
  }
  if (out.length % 2) out.pop();
  return out;
}

/** Parses a plain number list ("0 0 100 50"). null on any malformed token. */
export function parseNumberList(s: string): number[] | null {
  const out: number[] = [];
  let i = skipSep(s, 0);
  while (i < s.length) {
    const v = scanNumber(s, i);
    if (Number.isNaN(v)) return null;
    out.push(v);
    i = skipSep(s, scanPos);
  }
  return out;
}

// ---- transforms ------------------------------------------------------------

/** Returns null for malformed lists or non-finite results. */
export function parseTransform(s: string): Mat | null {
  let m: Mat = IDENTITY;
  const n = s.length;
  let i = skipSep(s, 0);
  let guard = 0;
  while (i < n) {
    if (++guard > 256) return null;
    const ns = i;
    while (i < n && /[A-Za-z]/.test(s[i]!)) i++;
    const name = s.slice(ns, i);
    while (i < n && s.charCodeAt(i) <= 32) i++;
    if (!name || s.charCodeAt(i) !== 40) return null;
    const close = s.indexOf(")", i);
    if (close < 0) return null;
    const args = parseNumberList(s.slice(i + 1, close));
    if (!args) return null;
    const a = args;
    let t: Mat | null = null;
    switch (name) {
      case "matrix":
        if (a.length === 6) t = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
        break;
      case "translate":
        if (a.length === 1 || a.length === 2) t = translateM(a[0]!, a[1] ?? 0);
        break;
      case "scale":
        if (a.length === 1 || a.length === 2) t = scaleM(a[0]!, a[1] ?? a[0]!);
        break;
      case "rotate":
        if (a.length === 1 || a.length === 3) {
          const r = (a[0]! * Math.PI) / 180;
          const cs = Math.cos(r);
          const sn = Math.sin(r);
          const rot: Mat = [cs, sn, -sn, cs, 0, 0];
          t = a.length === 3 ? mul(mul(translateM(a[1]!, a[2]!), rot), translateM(-a[1]!, -a[2]!)) : rot;
        }
        break;
      case "skewX":
        if (a.length === 1) t = [1, 0, Math.tan((a[0]! * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        if (a.length === 1) t = [1, Math.tan((a[0]! * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (!t) return null;
    m = mul(m, t);
    if (!finiteMat(m)) return null;
    i = skipSep(s, close + 1);
  }
  return m;
}

// ---- flattening sink -------------------------------------------------------

export const MAX_POINTS = 400_000;
/** Absolute accuracy goal for curve flattening, in mm. */
export const FLATNESS_MM = 0.05;
const MAX_CURVE_SEGMENTS = 256;
const MAX_ARC_SEGMENTS = 1024;

export class Budget {
  points = 0;
  /** Subpaths dropped because a coordinate was not finite. */
  nonFinite = 0;
}

/**
 * Receives user-space points, maps them to mm, removes duplicates and hands
 * finished subpaths to `onPath`. Curve helpers below flatten into it.
 */
export class Sink {
  /** Flatness tolerance in user units. */
  readonly tol: number;
  private cur: number[] = [];
  private bad = false;

  constructor(
    private readonly m: Mat,
    private readonly budget: Budget,
    private readonly onPath: (pts: number[], closed: boolean) => void,
  ) {
    const s = maxScale(m);
    this.tol = s > 0 && Number.isFinite(s) ? FLATNESS_MM / s : 1;
  }

  moveTo(x: number, y: number): void {
    this.finish(false);
    this.add(x, y);
  }

  lineTo(x: number, y: number): void {
    this.add(x, y);
  }

  close(): void {
    this.finish(true);
  }

  end(): void {
    this.finish(false);
  }

  private add(x: number, y: number): void {
    if (++this.budget.points > MAX_POINTS) {
      throw new SvgImportError(`This SVG is too detailed (more than ${MAX_POINTS.toLocaleString("en-US")} points after smoothing curves).`);
    }
    const m = this.m;
    const X = m[0] * x + m[2] * y + m[4];
    const Y = m[1] * x + m[3] * y + m[5];
    if (!Number.isFinite(X) || !Number.isFinite(Y)) {
      this.bad = true;
      return;
    }
    const c = this.cur;
    const l = c.length;
    if (l >= 2 && Math.abs(c[l - 2]! - X) < 1e-7 && Math.abs(c[l - 1]! - Y) < 1e-7) return;
    c.push(X, Y);
  }

  private finish(closed: boolean): void {
    const c = this.cur;
    const bad = this.bad;
    this.cur = [];
    this.bad = false;
    if (bad) {
      this.budget.nonFinite++;
      return;
    }
    if (closed && c.length >= 4 && Math.abs(c[0]! - c[c.length - 2]!) < 1e-7 && Math.abs(c[1]! - c[c.length - 1]!) < 1e-7) {
      c.length -= 2;
    }
    if (c.length < 4) return; // needs two distinct points
    this.onPath(c, closed && c.length >= 6);
  }
}

function segCount(v: number, cap: number): number {
  return Number.isFinite(v) ? Math.min(cap, Math.max(1, Math.ceil(v))) : cap;
}

export function cubicTo(k: Sink, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  // |B''| <= 6*max second difference, error <= |B''| / (8 n^2)
  const dd = Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
  const n = segCount(Math.sqrt((0.75 * dd) / k.tol), MAX_CURVE_SEGMENTS);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    k.lineTo(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
  }
  k.lineTo(x3, y3);
}

export function quadTo(k: Sink, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  const dd = Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
  const n = segCount(Math.sqrt(dd / (4 * k.tol)), MAX_CURVE_SEGMENTS);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const u = 1 - t;
    k.lineTo(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
  }
  k.lineTo(x2, y2);
}

/** Angle step that keeps the chord sagitta under the tolerance for radius r. */
function arcStep(r: number, tol: number): number {
  const ratio = Math.min(1, tol / r);
  const step = 2 * Math.acos(1 - ratio);
  return step > 1e-6 ? step : 1e-6;
}

const angleBetween = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/** SVG endpoint-parameterised arc (spec F.6.5) flattened from the current point. */
export function arcTo(k: Sink, x0: number, y0: number, rxIn: number, ryIn: number, rotDeg: number, large: boolean, sweep: boolean, x: number, y: number): void {
  if (x0 === x && y0 === y) return;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    k.lineTo(x, y);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cs * dx + sn * dy;
  const y1p = -sn * dx + cs * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cs * cxp - sn * cyp + (x0 + x) / 2;
  const cy = sn * cxp + cs * cyp + (y0 + y) / 2;
  const theta = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = segCount(Math.abs(delta) / arcStep(Math.max(rx, ry), k.tol), MAX_ARC_SEGMENTS);
  for (let i = 1; i < n; i++) {
    const t = theta + (delta * i) / n;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    k.lineTo(cx + cs * rx * ct - sn * ry * st, cy + sn * rx * ct + cs * ry * st);
  }
  k.lineTo(x, y);
}

// ---- path data -------------------------------------------------------------

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Feeds path data into the sink. Returns false if the data was malformed (what parsed before the error is kept, as browsers do). */
export function flattenPath(d: string, k: Sink): boolean {
  const n = d.length;
  let i = skipSep(d, 0);
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lcx = 0; // last control point for S/T reflection
  let lcy = 0;
  let prev = "";
  let needMove = false;
  let started = false;
  const a = [0, 0, 0, 0, 0, 0, 0];
  let ok = true;

  while (i < n) {
    const code = d.charCodeAt(i);
    let c: string;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      c = d[i]!;
      i = skipSep(d, i + 1);
      if (!(c.toLowerCase() in ARGS)) {
        ok = false;
        break;
      }
      if (!started && c !== "M" && c !== "m") {
        ok = false;
        break;
      }
      cmd = c;
    } else {
      if (!cmd || cmd === "z" || cmd === "Z") {
        ok = false;
        break;
      }
      c = cmd === "M" ? "L" : cmd === "m" ? "l" : cmd; // extra pairs after a moveto are linetos
    }
    started = true;
    const lower = c.toLowerCase();
    const rel = c === lower;
    const count = ARGS[lower]!;

    for (let j = 0; j < count; j++) {
      i = skipSep(d, i);
      let v: number;
      if (lower === "a" && (j === 3 || j === 4)) {
        const f = d.charCodeAt(i);
        if (f !== 48 && f !== 49) {
          ok = false;
          break;
        }
        v = f - 48;
        i++;
      } else {
        v = scanNumber(d, i);
        if (Number.isNaN(v)) {
          ok = false;
          break;
        }
        i = lastScanEnd();
      }
      a[j] = v;
    }
    if (!ok) break;
    i = skipSep(d, i);

    if (lower === "z") {
      k.close();
      cx = sx;
      cy = sy;
      needMove = true;
      prev = "z";
      continue;
    }
    if (lower === "m") {
      const x = rel ? cx + a[0]! : a[0]!;
      const y = rel ? cy + a[1]! : a[1]!;
      k.moveTo(x, y);
      cx = sx = x;
      cy = sy = y;
      needMove = false;
      prev = "m";
      continue;
    }
    if (needMove) {
      k.moveTo(cx, cy);
      needMove = false;
    }
    switch (lower) {
      case "l": {
        cx = rel ? cx + a[0]! : a[0]!;
        cy = rel ? cy + a[1]! : a[1]!;
        k.lineTo(cx, cy);
        break;
      }
      case "h": {
        cx = rel ? cx + a[0]! : a[0]!;
        k.lineTo(cx, cy);
        break;
      }
      case "v": {
        cy = rel ? cy + a[0]! : a[0]!;
        k.lineTo(cx, cy);
        break;
      }
      case "c": {
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const x1 = ox + a[0]!, y1 = oy + a[1]!, x2 = ox + a[2]!, y2 = oy + a[3]!, x = ox + a[4]!, y = oy + a[5]!;
        cubicTo(k, cx, cy, x1, y1, x2, y2, x, y);
        lcx = x2;
        lcy = y2;
        cx = x;
        cy = y;
        break;
      }
      case "s": {
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const smooth = prev === "c" || prev === "s";
        const x1 = smooth ? 2 * cx - lcx : cx;
        const y1 = smooth ? 2 * cy - lcy : cy;
        const x2 = ox + a[0]!, y2 = oy + a[1]!, x = ox + a[2]!, y = oy + a[3]!;
        cubicTo(k, cx, cy, x1, y1, x2, y2, x, y);
        lcx = x2;
        lcy = y2;
        cx = x;
        cy = y;
        break;
      }
      case "q": {
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const x1 = ox + a[0]!, y1 = oy + a[1]!, x = ox + a[2]!, y = oy + a[3]!;
        quadTo(k, cx, cy, x1, y1, x, y);
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case "t": {
        const smooth = prev === "q" || prev === "t";
        const x1 = smooth ? 2 * cx - lcx : cx;
        const y1 = smooth ? 2 * cy - lcy : cy;
        const x = rel ? cx + a[0]! : a[0]!;
        const y = rel ? cy + a[1]! : a[1]!;
        quadTo(k, cx, cy, x1, y1, x, y);
        lcx = x1;
        lcy = y1;
        cx = x;
        cy = y;
        break;
      }
      case "a": {
        const x = rel ? cx + a[5]! : a[5]!;
        const y = rel ? cy + a[6]! : a[6]!;
        arcTo(k, cx, cy, a[0]!, a[1]!, a[2]!, a[3] === 1, a[4] === 1, x, y);
        cx = x;
        cy = y;
        break;
      }
    }
    prev = lower;
  }
  k.end();
  return ok;
}

// ---- basic shapes ----------------------------------------------------------

export function rectShape(k: Sink, x: number, y: number, w: number, h: number, rxIn: number, ryIn: number): void {
  let rx = rxIn;
  let ry = ryIn;
  if (!(rx > 0) && ry > 0) rx = ry;
  if (!(ry > 0) && rx > 0) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx > 0 && ry > 0) {
    k.moveTo(x + rx, y);
    k.lineTo(x + w - rx, y);
    arcTo(k, x + w - rx, y, rx, ry, 0, false, true, x + w, y + ry);
    k.lineTo(x + w, y + h - ry);
    arcTo(k, x + w, y + h - ry, rx, ry, 0, false, true, x + w - rx, y + h);
    k.lineTo(x + rx, y + h);
    arcTo(k, x + rx, y + h, rx, ry, 0, false, true, x, y + h - ry);
    k.lineTo(x, y + ry);
    arcTo(k, x, y + ry, rx, ry, 0, false, true, x + rx, y);
  } else {
    k.moveTo(x, y);
    k.lineTo(x + w, y);
    k.lineTo(x + w, y + h);
    k.lineTo(x, y + h);
  }
  k.close();
}

export function ellipseShape(k: Sink, cx: number, cy: number, rx: number, ry: number): void {
  const n = Math.min(MAX_ARC_SEGMENTS, Math.max(12, Math.ceil((2 * Math.PI) / arcStep(Math.max(rx, ry), k.tol))));
  k.moveTo(cx + rx, cy);
  for (let i = 1; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    k.lineTo(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  k.close();
}
