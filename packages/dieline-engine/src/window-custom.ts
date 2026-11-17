import { type Vec2, vec } from "./primitives/vec2";

/**
 * Custom window shapes ("Dynamic Crop"): a window whose holes are drawn by the person, either with the pen tool or by
 * tracing the filled part of a picture. The holes are stored as loops of numbers in the window's own box, `x, y, x, y, ...`
 * with both axes running from -0.5 to 0.5, so the shape stretches with the box like every other shape.
 *
 * No DOM here: the picture is turned into a black and white grid by the web app, and `maskToLoops` finds the outlines.
 */

export const CUSTOM_MAX_LOOPS = 12;
export const CUSTOM_MAX_POINTS = 1500;
export const isCustomShape = (shape: string): boolean => shape === "custom";

type Seg = readonly [Vec2, Vec2];
const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** True when the two segments cross (touching at a shared end does not count). */
function crosses([a, b]: Seg, [c, d]: Seg): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when no two edges of the closed polygon cross. */
export function isSimpleLoop(pts: readonly Vec2[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a: Seg = [pts[i]!, pts[(i + 1) % n]!];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      if (crosses(a, [pts[j]!, pts[(j + 1) % n]!])) return false;
    }
  }
  return true;
}

const toPoints = (loop: readonly number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < loop.length; i += 2) out.push(vec(loop[i]!, loop[i + 1]!));
  return out;
};

const verdicts = new WeakMap<object, string | null>();

/** What is wrong with the loops of a custom window, or null. (The answer is remembered: a drag asks again and again.) */
export function checkCustomLoops(loops: readonly (readonly number[])[] | undefined): string | null {
  if (!loops || loops.length === 0) return "This shape has no outline.";
  const known = verdicts.get(loops);
  if (known !== undefined) return known;
  const say = (m: string | null) => (verdicts.set(loops, m), m);
  if (loops.length > CUSTOM_MAX_LOOPS) return say(`At most ${CUSTOM_MAX_LOOPS} separate pieces.`);
  let total = 0;
  for (const loop of loops) {
    if (loop.length < 6 || loop.length % 2 !== 0 || loop.some((v) => !Number.isFinite(v) || Math.abs(v) > 0.51)) return say("The outline is not valid.");
    total += loop.length / 2;
  }
  if (total > CUSTOM_MAX_POINTS) return say(`The outline has too many points (at most ${CUSTOM_MAX_POINTS}).`);
  for (const loop of loops) if (!isSimpleLoop(toPoints(loop))) return say("The outline crosses itself: draw it again without crossing lines.");
  return say(null);
}

/** The holes of a custom window in a box of `w` x `h` centred on the origin (before the rotation). */
export function customHoles(w: number, h: number, loops: readonly (readonly number[])[] | undefined): Vec2[][] {
  if (checkCustomLoops(loops)) return [];
  return loops!.map((loop) => toPoints(loop).map((p) => vec(p.x * w, p.y * h)));
}

// ------------------------------------------------------------------ making loops

export interface FittedLoops {
  /** Loops with both axes from -0.5 to 0.5 (together they touch all four sides of the box). */
  readonly loops: number[][];
  /** The box the loops were in: centre and size, in the units they were given in. */
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

/** Scale loops (any units) into the stored form. Null when they have no area. */
export function fitLoops(loops: readonly (readonly Vec2[])[]): FittedLoops | null {
  const all = loops.flat();
  if (all.length < 3) return null;
  const x0 = Math.min(...all.map((p) => p.x));
  const x1 = Math.max(...all.map((p) => p.x));
  const y0 = Math.min(...all.map((p) => p.y));
  const y1 = Math.max(...all.map((p) => p.y));
  const width = x1 - x0;
  const height = y1 - y0;
  if (!(width > 0) || !(height > 0)) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return { loops: loops.map((l) => l.flatMap((p) => [r((p.x - cx) / width), r((p.y - cy) / height)])), cx, cy, width, height };
}

const polygonArea = (pts: readonly Vec2[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

/** Douglas-Peucker on a closed loop: drops points that lie within `eps` of the line between their neighbours. */
export function simplifyLoop(pts: readonly Vec2[], eps: number): Vec2[] {
  if (pts.length <= 3) return [...pts];
  const dist = (p: Vec2, a: Vec2, b: Vec2) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
  };
  const keep = new Set<number>();
  const run = (from: number, to: number) => {
    let far = -1;
    let best = eps;
    for (let i = from + 1; i < to; i++) {
      const d = dist(pts[i]!, pts[from]!, pts[to]!);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep.add(far);
      run(from, far);
      run(far, to);
    }
  };
  // A closed loop has no ends: cut it at the point farthest from the first one.
  let split = 1;
  let longest = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[0]!.x, pts[i]!.y - pts[0]!.y);
    if (d > longest) {
      longest = d;
      split = i;
    }
  }
  keep.add(0);
  keep.add(split);
  run(0, split);
  const tail = [...pts.slice(split), pts[0]!];
  const tailKeep = new Set<number>();
  const runTail = (from: number, to: number) => {
    let far = -1;
    let best = eps;
    for (let i = from + 1; i < to; i++) {
      const d = dist(tail[i]!, tail[from]!, tail[to]!);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far >= 0) {
      tailKeep.add(far);
      runTail(from, far);
      runTail(far, to);
    }
  };
  runTail(0, tail.length - 1);
  const first = [...keep].sort((a, b) => a - b).map((i) => pts[i]!);
  const second = [...tailKeep].sort((a, b) => a - b).map((i) => tail[i]!);
  return [...first, ...second];
}

/** Chaikin corner cutting: rounds a closed polygon (each pass doubles the points). */
export function smoothLoop(pts: readonly Vec2[], passes = 2): Vec2[] {
  let cur = [...pts];
  for (let k = 0; k < passes; k++) {
    const next: Vec2[] = [];
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i]!;
      const q = cur[(i + 1) % cur.length]!;
      next.push(vec(0.75 * p.x + 0.25 * q.x, 0.75 * p.y + 0.25 * q.y), vec(0.25 * p.x + 0.75 * q.x, 0.25 * p.y + 0.75 * q.y));
    }
    cur = next;
  }
  return cur;
}

/**
 * The outlines of the filled part of a black and white grid (`mask[y * w + x]` is 1 where filled). Only the outer
 * edge of each piece is returned: a hole inside a piece is filled in, because a cut-out cannot have an island.
 * Pieces smaller than `minShare` of the biggest one are dropped. Coordinates are in grid cells, y down.
 */
export function maskToLoops(mask: Uint8Array, w: number, h: number, opts: { minShare?: number; eps?: number } = {}): Vec2[][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  // Directed edges along the border of the filled cells, the filled side on the right (outer loops come out clockwise).
  const next = new Map<number, number[]>(); // from vertex -> list of "to" vertices (vertex = y * (w + 1) + x)
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = next.get(k);
    if (list) list.push(key(x1, y1));
    else next.set(k, [key(x1, y1)]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const vertex = (k: number) => vec(k % (w + 1), Math.floor(k / (w + 1)));
  const loops: Vec2[][] = [];
  for (const [start] of next) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: Vec2[] = [];
      let cur = start;
      for (let guard = 0; guard < 4 * (w + 1) * (h + 1); guard++) {
        const outs = next.get(cur);
        if (!outs || outs.length === 0) break;
        const to = outs.pop()!;
        loop.push(vertex(cur));
        cur = to;
        if (cur === start) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  const outer = loops.map((l) => ({ l, a: polygonArea(l) })).filter((x) => x.a > 0);
  if (outer.length === 0) return [];
  const biggest = Math.max(...outer.map((x) => x.a));
  const kept = outer.filter((x) => x.a >= biggest * (opts.minShare ?? 0.01)).sort((p, q) => q.a - p.a).slice(0, CUSTOM_MAX_LOOPS);
  let eps = opts.eps ?? 0.9;
  for (let tries = 0; tries < 6; tries++) {
    const simple = kept.map((x) => simplifyLoop(x.l, eps)).filter((l) => l.length >= 3);
    if (simple.reduce((n, l) => n + l.length, 0) <= CUSTOM_MAX_POINTS) return simple;
    eps *= 1.6;
  }
  return kept.map((x) => simplifyLoop(x.l, eps)).filter((l) => l.length >= 3);
}

/** The filled part of a black and white grid as a custom shape in the stored form, or null when there is nothing usable. */
export function traceMask(mask: Uint8Array, w: number, h: number): FittedLoops | null {
  for (const eps of [0.9, 0.6, 0.35, 0.15]) {
    const fitted = fitLoops(maskToLoops(mask, w, h, { eps }));
    if (fitted && !checkCustomLoops(fitted.loops)) return fitted;
  }
  return null;
}
