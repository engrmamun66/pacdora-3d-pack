import { bounds } from "./primitives/polygon";
import { type Vec2, vec } from "./primitives/vec2";

/**
 * The shapes a window hole can have. One table: every shape is a function that draws it inside a box of `w` x `h`
 * (centred on the origin, y down, before the rotation) as ONE simple polygon, so the engine can cut it, the 3D box can
 * show it and every export can draw it. Shapes are grouped for the palette ("Basic Shapes", "More Shapes").
 *
 * Most shapes are drawn in a unit frame and then stretched to fill the box exactly (`fit`); a few depend on the box
 * (rounded corners, notches, waves), so they are drawn from `w` and `h` directly.
 */

const TAU = 2 * Math.PI;
type Pt = readonly [number, number];

/** Points on an elliptical arc (centre, radii, angles in radians). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push(vec(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
}

/** Stretch a drawing so its bounding box is exactly `w` x `h` and centred on the origin. */
function fit(pts: readonly Vec2[], w: number, h: number): Vec2[] {
  const b = bounds(pts);
  const sx = w / (b.max.x - b.min.x);
  const sy = h / (b.max.y - b.min.y);
  const cx = (b.max.x + b.min.x) / 2;
  const cy = (b.max.y + b.min.y) / 2;
  return pts.map((p) => vec((p.x - cx) * sx, (p.y - cy) * sy));
}

/** A shape drawn in a unit frame, then fitted to the box. */
const drawn = (fn: () => Vec2[]) => (w: number, h: number): Vec2[] => fit(fn(), w, h);
/** A fixed list of corners, fitted to the box. */
const corners = (pts: readonly Pt[]) => drawn(() => pts.map(([x, y]) => vec(x, y)));

const regular = (n: number, rot = -Math.PI / 2): Vec2[] => Array.from({ length: n }, (_, i) => vec(Math.cos(rot + (i * TAU) / n), Math.sin(rot + (i * TAU) / n)));
const polarStar = (n: number, inner: number, rot = -Math.PI / 2): Vec2[] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (i * Math.PI) / n;
    const k = i % 2 === 0 ? 1 : inner;
    return vec(k * Math.cos(a), k * Math.sin(a));
  });
/** A closed curve given as a radius for each angle. */
const radial = (r: (t: number) => number, steps = 120): Vec2[] => Array.from({ length: steps }, (_, i) => {
  const t = (i / steps) * TAU;
  return vec(r(t) * Math.cos(t), r(t) * Math.sin(t));
});
const quad = (a: Pt, c: Pt, b: Pt, steps = 20): Vec2[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return vec(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]);
  });
const mirrorX = (pts: readonly Vec2[]): Vec2[] => pts.map((p) => vec(-p.x, p.y)).reverse();

type Part = { circle: readonly [number, number, number] } | { box: readonly [number, number, number, number] };
/**
 * The outline of circles (and boxes) laid over each other, as long as the origin lies inside one of them: for every
 * direction, how far the union reaches from the origin. `floor` flattens everything below that y.
 */
function blob(parts: readonly Part[], floor?: number, steps = 144): Vec2[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * TAU;
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    let reach = 0;
    for (const p of parts) {
      if ("circle" in p) {
        const [qx, qy, r] = p.circle;
        const b = ux * qx + uy * qy;
        const disc = r * r - (qx * qx + qy * qy) + b * b;
        if (disc >= 0) reach = Math.max(reach, b + Math.sqrt(disc));
      } else {
        const [x0, y0, x1, y1] = p.box;
        const tx = ux > 1e-9 ? x1 / ux : ux < -1e-9 ? x0 / ux : Infinity;
        const ty = uy > 1e-9 ? y1 / uy : uy < -1e-9 ? y0 / uy : Infinity;
        reach = Math.max(reach, Math.min(tx, ty));
      }
    }
    const x = reach * ux;
    const y = reach * uy;
    return vec(x, floor !== undefined ? Math.min(y, floor) : y);
  });
}

export interface ShapeDef {
  readonly label: string;
  readonly group: "basic" | "more";
  /** Width / height a new window of this shape starts with. */
  readonly ratio: number;
  /** New windows keep their proportions until the person unlocks them (round and regular shapes). */
  readonly lock?: boolean;
  /** Size of a new window as a share of the panel it is put on: [width, height]. Default: derived from `ratio`. */
  readonly start?: readonly [number, number];
  readonly build: (w: number, h: number) => Vec2[];
}

const roundedRect = (w: number, h: number, r: number): Vec2[] => [
  ...arc(w / 2 - r, -h / 2 + r, r, r, -Math.PI / 2, 0, 8),
  ...arc(w / 2 - r, h / 2 - r, r, r, 0, Math.PI / 2, 8),
  ...arc(-w / 2 + r, h / 2 - r, r, r, Math.PI / 2, Math.PI, 8),
  ...arc(-w / 2 + r, -h / 2 + r, r, r, Math.PI, (3 * Math.PI) / 2, 8),
];

const def = (d: ShapeDef): ShapeDef => d;

/** Every shape. The order is the order of the palette (basic first, then the rest). */
export const SHAPE_DEFS = {
  // ---------------------------------------------------------------- Basic Shapes
  rectangle: def({ label: "Rectangle", group: "basic", ratio: 1.39, start: [0.5, 0.36], build: (w, h) => [vec(-w / 2, -h / 2), vec(w / 2, -h / 2), vec(w / 2, h / 2), vec(-w / 2, h / 2)] }),
  "rounded-rectangle": def({ label: "Rounded rectangle", group: "basic", ratio: 1.39, start: [0.5, 0.36], build: (w, h) => roundedRect(w, h, Math.min(w, h) * 0.2) }),
  circle: def({ label: "Circle", group: "basic", ratio: 1, lock: true, start: [0.34, 0.34], build: (w, h) => arc(0, 0, w / 2, h / 2, 0, TAU, 72).slice(0, -1) }),
  ellipse: def({ label: "Ellipse", group: "basic", ratio: 1.47, start: [0.5, 0.34], build: (w, h) => arc(0, 0, w / 2, h / 2, 0, TAU, 72).slice(0, -1) }),
  stadium: def({
    label: "Pill",
    group: "basic",
    ratio: 2.5,
    start: [0.55, 0.26],
    build: (w, h) => {
      if (w >= h) {
        const r = h / 2;
        return [...arc(w / 2 - r, 0, r, r, -Math.PI / 2, Math.PI / 2, 18), ...arc(-w / 2 + r, 0, r, r, Math.PI / 2, (3 * Math.PI) / 2, 18)];
      }
      const r = w / 2;
      return [...arc(0, h / 2 - r, r, r, 0, Math.PI, 18), ...arc(0, -h / 2 + r, r, r, Math.PI, TAU, 18)];
    },
  }),
  arch: def({
    label: "Arch",
    group: "basic",
    ratio: 0.77,
    start: [0.34, 0.44],
    build: (w, h) => {
      // Flat bottom, a half circle on top (the radius shrinks when the box is lower than half its width).
      const hw = w / 2;
      const hh = h / 2;
      const ry = Math.min(hw, h);
      return [vec(-hw, hh), vec(-hw, -hh + ry), ...arc(0, -hh + ry, hw, ry, Math.PI, TAU, 36).slice(1, -1), vec(hw, -hh + ry), vec(hw, hh)];
    },
  }),
  diamond: def({ label: "Diamond", group: "basic", ratio: 1, lock: true, start: [0.4, 0.4], build: (w, h) => [vec(0, -h / 2), vec(w / 2, 0), vec(0, h / 2), vec(-w / 2, 0)] }),
  hexagon: def({ label: "Hexagon", group: "basic", ratio: 1, lock: true, start: [0.46, 0.4], build: (w, h) => [vec(-w / 2, 0), vec(-w / 4, -h / 2), vec(w / 4, -h / 2), vec(w / 2, 0), vec(w / 4, h / 2), vec(-w / 4, h / 2)] }),
  star: def({ label: "Star", group: "basic", ratio: 1, lock: true, start: [0.4, 0.4], build: drawn(() => polarStar(5, 0.4)) }),
  heart: def({
    label: "Heart",
    group: "basic",
    ratio: 1,
    lock: true,
    start: [0.4, 0.38],
    build: drawn(() =>
      Array.from({ length: 96 }, (_, i) => {
        const t = (i / 96) * TAU;
        return vec(16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
      }),
    ),
  }),
  flower: def({
    label: "Flower",
    group: "basic",
    ratio: 1,
    lock: true,
    build: drawn(() => blob([{ circle: [0, 0, 0.6] }, ...Array.from({ length: 5 }, (_, i) => ({ circle: [0.56 * Math.cos(-Math.PI / 2 + (i * TAU) / 5), 0.56 * Math.sin(-Math.PI / 2 + (i * TAU) / 5), 0.42] as const }))])),
  }),
  "scalloped-rectangle": def({
    label: "Scalloped rectangle",
    group: "basic",
    ratio: 0.62,
    start: [0.34, 0.5],
    build: (w, h) => {
      // A rectangle whose edges are a row of round bumps; the bumps meet in a point at each corner.
      const b = Math.min(w, h) * 0.05;
      const ix = w / 2 - b;
      const iy = h / 2 - b;
      const nx = Math.max(2, Math.round((2 * ix) / (b * 2.4)));
      const ny = Math.max(2, Math.round((2 * iy) / (b * 2.4)));
      const per = 8;
      const out: Vec2[] = [];
      const bump = (j: number) => b * Math.abs(Math.sin((Math.PI * j) / per));
      for (let k = 0; k < nx; k++) for (let j = 0; j < per; j++) out.push(vec(-ix + ((2 * ix) * (k + j / per)) / nx, -iy - bump(j)));
      for (let k = 0; k < ny; k++) for (let j = 0; j < per; j++) out.push(vec(ix + bump(j), -iy + ((2 * iy) * (k + j / per)) / ny));
      for (let k = 0; k < nx; k++) for (let j = 0; j < per; j++) out.push(vec(ix - ((2 * ix) * (k + j / per)) / nx, iy + bump(j)));
      for (let k = 0; k < ny; k++) for (let j = 0; j < per; j++) out.push(vec(-ix - bump(j), iy - ((2 * iy) * (k + j / per)) / ny));
      return out;
    },
  }),
  teardrop: def({
    label: "Teardrop",
    group: "basic",
    ratio: 0.8,
    build: drawn(() =>
      Array.from({ length: 96 }, (_, i) => {
        // Drawn with the point on the right, then turned to point up.
        const t = (i / 96) * TAU;
        const x = Math.cos(t);
        const y = Math.sin(t) * Math.sin(t / 2);
        return vec(y, -x);
      }),
    ),
  }),

  // ---------------------------------------------------------------- More Shapes
  triangle: def({ label: "Triangle", group: "more", ratio: 1.15, build: corners([[0, -1], [1, 1], [-1, 1]]) }),
  "right-triangle": def({ label: "Right triangle", group: "more", ratio: 1, build: corners([[-1, -1], [-1, 1], [1, 1]]) }),
  trapezoid: def({ label: "Trapezoid", group: "more", ratio: 1.5, build: corners([[-0.6, -1], [0.6, -1], [1, 1], [-1, 1]]) }),
  parallelogram: def({ label: "Parallelogram", group: "more", ratio: 1.6, build: corners([[-0.5, -1], [1, -1], [0.5, 1], [-1, 1]]) }),
  kite: def({ label: "Kite", group: "more", ratio: 0.8, build: corners([[0, -1], [0.7, -0.2], [0, 1], [-0.7, -0.2]]) }),
  pentagon: def({ label: "Pentagon", group: "more", ratio: 1, lock: true, build: drawn(() => regular(5)) }),
  octagon: def({ label: "Octagon", group: "more", ratio: 1, lock: true, build: drawn(() => regular(8, Math.PI / 8)) }),
  decagon: def({ label: "Decagon", group: "more", ratio: 1, lock: true, build: drawn(() => regular(10)) }),
  semicircle: def({ label: "Semicircle", group: "more", ratio: 2, build: drawn(() => arc(0, 0, 1, 1, Math.PI, TAU, 40)) }),
  "quarter-circle": def({ label: "Quarter circle", group: "more", ratio: 1, build: drawn(() => [vec(-1, 1), ...arc(-1, 1, 2, 2, -Math.PI / 2, 0, 32)]) }),
  pie: def({ label: "Pie", group: "more", ratio: 1, lock: true, build: drawn(() => [vec(0, 0), ...arc(0, 0, 1, 1, -Math.PI / 2, Math.PI, 54)]) }),
  crescent: def({
    label: "Crescent",
    group: "more",
    ratio: 0.85,
    build: drawn(() => {
      // Circle of radius 1 minus a circle of radius 0.85 shifted right by 0.55.
      const d = 0.55;
      const r2 = 0.85;
      const x0 = (d * d + 1 - r2 * r2) / (2 * d);
      const y0 = Math.sqrt(1 - x0 * x0);
      const aq = Math.atan2(y0, x0);
      const ap2 = Math.atan2(-y0, x0 - d) + TAU;
      const aq2 = Math.atan2(y0, x0 - d);
      return [...arc(0, 0, 1, 1, aq, TAU - aq, 48), ...arc(d, 0, r2, r2, ap2, aq2, 40).slice(1, -1)];
    }),
  }),
  cross: def({ label: "Cross", group: "more", ratio: 1, lock: true, build: corners([[-0.33, -1], [0.33, -1], [0.33, -0.33], [1, -0.33], [1, 0.33], [0.33, 0.33], [0.33, 1], [-0.33, 1], [-0.33, 0.33], [-1, 0.33], [-1, -0.33], [-0.33, -0.33]]) }),
  "rounded-cross": def({
    label: "Rounded cross",
    group: "more",
    ratio: 1,
    lock: true,
    build: drawn(() => {
      const t = 0.33;
      const e = 1 - t;
      return [
        ...arc(0, -e, t, t, Math.PI, TAU, 10),
        vec(t, -t),
        ...arc(e, 0, t, t, -Math.PI / 2, Math.PI / 2, 10),
        vec(t, t),
        ...arc(0, e, t, t, 0, Math.PI, 10),
        vec(-t, t),
        ...arc(-e, 0, t, t, Math.PI / 2, (3 * Math.PI) / 2, 10),
        vec(-t, -t),
      ];
    }),
  }),
  "x-mark": def({
    label: "X mark",
    group: "more",
    ratio: 1,
    lock: true,
    build: drawn(() => {
      const t = 0.3;
      const plus: Pt[] = [[-t, -1], [t, -1], [t, -t], [1, -t], [1, t], [t, t], [t, 1], [-t, 1], [-t, t], [-1, t], [-1, -t], [-t, -t]];
      const c = Math.SQRT1_2;
      return plus.map(([x, y]) => vec(x * c - y * c, x * c + y * c));
    }),
  }),
  chevron: def({ label: "Chevron", group: "more", ratio: 1, build: corners([[-1, -1], [0.2, -1], [1, 0], [0.2, 1], [-1, 1], [-0.2, 0]]) }),
  arrow: def({ label: "Arrow", group: "more", ratio: 1.6, build: corners([[-1, -0.3], [0.2, -0.3], [0.2, -1], [1, 0], [0.2, 1], [0.2, 0.3], [-1, 0.3]]) }),
  "double-arrow": def({ label: "Double arrow", group: "more", ratio: 1.8, build: corners([[-1, 0], [-0.4, -0.8], [-0.4, -0.3], [0.4, -0.3], [0.4, -0.8], [1, 0], [0.4, 0.8], [0.4, 0.3], [-0.4, 0.3], [-0.4, 0.8]]) }),
  "home-plate": def({ label: "Pentagon arrow", group: "more", ratio: 1.3, build: corners([[-1, -1], [0.3, -1], [1, 0], [0.3, 1], [-1, 1]]) }),
  lightning: def({ label: "Lightning bolt", group: "more", ratio: 0.7, build: corners([[0.25, -1], [-0.65, 0.1], [-0.1, 0.1], [-0.3, 1], [0.65, -0.25], [0.1, -0.25]]) }),
  "star-4": def({ label: "Star, 4 points", group: "more", ratio: 1, lock: true, build: drawn(() => polarStar(4, 0.38)) }),
  "star-6": def({ label: "Star, 6 points", group: "more", ratio: 1, lock: true, build: drawn(() => polarStar(6, 0.577)) }),
  "star-8": def({ label: "Star, 8 points", group: "more", ratio: 1, lock: true, build: drawn(() => polarStar(8, 0.55, -Math.PI / 2)) }),
  starburst: def({ label: "Starburst", group: "more", ratio: 1, lock: true, build: drawn(() => polarStar(16, 0.74)) }),
  seal: def({ label: "Seal", group: "more", ratio: 1, lock: true, build: drawn(() => radial((t) => 0.88 + 0.12 * Math.abs(Math.cos(6 * t)), 192)) }),
  gear: def({
    label: "Gear",
    group: "more",
    ratio: 1,
    lock: true,
    build: drawn(() => {
      const n = 8;
      const rin = 0.78;
      const pts: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        for (const [f, r] of [[0, rin], [0.1, 1], [0.4, 1], [0.5, rin], [0.75, rin]] as const) {
          const a = ((i + f) * TAU) / n;
          pts.push(vec(r * Math.cos(a), r * Math.sin(a)));
        }
      }
      return pts;
    }),
  }),
  cloud: def({
    label: "Cloud",
    group: "more",
    ratio: 1.6,
    build: drawn(() => blob([{ circle: [-0.55, 0.15, 0.45] }, { circle: [-0.1, -0.2, 0.55] }, { circle: [0.45, -0.05, 0.5] }, { circle: [0.75, 0.25, 0.35] }, { box: [-0.7, -0.1, 0.9, 0.5] }], 0.5)),
  }),
  shield: def({
    label: "Shield",
    group: "more",
    ratio: 0.85,
    build: drawn(() => {
      const right = quad([1, 0], [1, 0.75], [0, 1], 22); // down the right side to the point
      return [vec(-1, -1), vec(1, -1), ...right, ...mirrorX(right).slice(1)];
    }),
  }),
  leaf: def({ label: "Leaf", group: "more", ratio: 1, build: drawn(() => [...quad([-1, 1], [-1, -1], [1, -1], 28), ...quad([1, -1], [1, 1], [-1, 1], 28).slice(1, -1)]) }),
  keyhole: def({
    label: "Keyhole",
    group: "more",
    ratio: 0.6,
    build: drawn(() => [...arc(0, -0.35, 0.65, 0.65, (2 * Math.PI) / 3, (7 * Math.PI) / 3, 40), vec(0.45, 1), vec(-0.45, 1)]),
  }),
  "speech-bubble": def({
    label: "Speech bubble",
    group: "more",
    ratio: 1.3,
    build: drawn(() => {
      const r = 0.3;
      return [
        ...arc(1 - r, -1 + r, r, r, -Math.PI / 2, 0, 8),
        ...arc(1 - r, 0.4 - r, r, r, 0, Math.PI / 2, 8),
        vec(-0.2, 0.4),
        vec(-0.7, 1),
        vec(-0.55, 0.4),
        ...arc(-1 + r, 0.4 - r, r, r, Math.PI / 2, Math.PI, 8),
        ...arc(-1 + r, -1 + r, r, r, Math.PI, (3 * Math.PI) / 2, 8),
      ];
    }),
  }),
  bookmark: def({ label: "Bookmark", group: "more", ratio: 0.55, build: corners([[-0.6, -1], [0.6, -1], [0.6, 1], [0, 0.5], [-0.6, 1]]) }),
  hourglass: def({ label: "Hourglass", group: "more", ratio: 0.8, build: corners([[-1, -1], [1, -1], [0.12, 0], [1, 1], [-1, 1], [-0.12, 0]]) }),
  "cut-corner-rectangle": def({
    label: "Cut-corner rectangle",
    group: "more",
    ratio: 1.39,
    start: [0.5, 0.36],
    build: (w, h) => {
      const c = Math.min(w, h) * 0.22;
      const hw = w / 2;
      const hh = h / 2;
      return [vec(-hw + c, -hh), vec(hw - c, -hh), vec(hw, -hh + c), vec(hw, hh - c), vec(hw - c, hh), vec(-hw + c, hh), vec(-hw, hh - c), vec(-hw, -hh + c)];
    },
  }),
  "leaf-rectangle": def({
    label: "Leaf rectangle",
    group: "more",
    ratio: 1.39,
    start: [0.5, 0.36],
    build: (w, h) => {
      const r = Math.min(w, h) * 0.4;
      const hw = w / 2;
      const hh = h / 2;
      return [vec(hw, -hh), ...arc(hw - r, hh - r, r, r, 0, Math.PI / 2, 14), vec(-hw, hh), ...arc(-hw + r, -hh + r, r, r, Math.PI, (3 * Math.PI) / 2, 14)];
    },
  }),
  ticket: def({
    label: "Ticket",
    group: "more",
    ratio: 1.6,
    start: [0.5, 0.34],
    build: (w, h) => {
      const r = Math.min(w, h) * 0.14;
      const hw = w / 2;
      const hh = h / 2;
      return [vec(-hw, -hh), vec(hw, -hh), ...arc(hw, 0, r, r, -Math.PI / 2, (-3 * Math.PI) / 2, 14), vec(hw, hh), vec(-hw, hh), ...arc(-hw, 0, r, r, Math.PI / 2, -Math.PI / 2, 14)];
    },
  }),
  plaque: def({
    label: "Plaque",
    group: "more",
    ratio: 1.39,
    start: [0.5, 0.36],
    build: (w, h) => {
      const c = Math.min(w, h) * 0.2;
      const hw = w / 2;
      const hh = h / 2;
      return [
        ...arc(hw, -hh, c, c, Math.PI, Math.PI / 2, 10),
        ...arc(hw, hh, c, c, (3 * Math.PI) / 2, Math.PI, 10),
        ...arc(-hw, hh, c, c, 0, -Math.PI / 2, 10),
        ...arc(-hw, -hh, c, c, Math.PI / 2, 0, 10),
      ];
    },
  }),
  squircle: def({ label: "Squircle", group: "more", ratio: 1, build: drawn(() => Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * TAU; const c = Math.cos(t); const s = Math.sin(t); return vec(Math.sign(c) * Math.abs(c) ** 0.5, Math.sign(s) * Math.abs(s) ** 0.5); })) }),
  egg: def({ label: "Egg", group: "more", ratio: 0.75, build: drawn(() => Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * TAU; return vec(Math.cos(t) * (1 + 0.2 * Math.sin(t)), Math.sin(t)); })) }),
  lens: def({
    label: "Lens",
    group: "more",
    ratio: 1.8,
    build: drawn(() => {
      const R = 1.25;
      const top = Array.from({ length: 41 }, (_, i) => { const x = -1 + (2 * i) / 40; return vec(x, -(Math.sqrt(R * R - x * x) - (R - 0.5))); });
      return [...top, ...top.map((p) => vec(p.x, -p.y)).reverse().slice(1, -1)];
    }),
  }),
  "arc-band": def({ label: "Arc band", group: "more", ratio: 2, build: drawn(() => [...arc(0, 0, 1, 1, Math.PI, TAU, 40), ...arc(0, 0, 0.6, 0.6, TAU, Math.PI, 30)]) }),
  daisy: def({
    label: "Daisy",
    group: "more",
    ratio: 1,
    lock: true,
    build: drawn(() => blob([{ circle: [0, 0, 0.72] }, ...Array.from({ length: 8 }, (_, i) => ({ circle: [0.74 * Math.cos((i * TAU) / 8), 0.74 * Math.sin((i * TAU) / 8), 0.26] as const }))], undefined, 192)),
  }),
  clover: def({
    label: "Clover",
    group: "more",
    ratio: 1,
    lock: true,
    build: drawn(() => blob([{ circle: [0, 0, 0.4] }, { circle: [0.52, 0, 0.48] }, { circle: [-0.52, 0, 0.48] }, { circle: [0, 0.52, 0.48] }, { circle: [0, -0.52, 0.48] }])),
  }),
  "wavy-rectangle": def({
    label: "Wavy rectangle",
    group: "more",
    ratio: 1.6,
    start: [0.5, 0.34],
    build: (w, h) => {
      const a = Math.min(w, h) * 0.07;
      const k = Math.max(2, Math.round((w / Math.min(w, h)) * 1.5));
      const steps = 24 * k;
      const hw = w / 2;
      const hh = h / 2;
      const top: Vec2[] = [];
      const bottom: Vec2[] = [];
      for (let i = 0; i <= steps; i++) {
        const x = -hw + (w * i) / steps;
        const wave = a * (1 + Math.sin((TAU * k * i) / steps));
        top.push(vec(x, -hh + wave));
        bottom.push(vec(x, hh - 2 * a + wave));
      }
      return [...top, ...bottom.reverse()];
    },
  }),
  "zigzag-rectangle": def({
    label: "Zigzag rectangle",
    group: "more",
    ratio: 0.8,
    start: [0.34, 0.42],
    build: (w, h) => {
      const d = Math.min(w, h) * 0.07;
      const n = Math.max(4, 2 * Math.round(h / (Math.min(w, h) * 0.25)));
      const hw = w / 2;
      const hh = h / 2;
      const right = Array.from({ length: n + 1 }, (_, i) => vec(hw - d * (i % 2), -hh + (h * i) / n));
      const left = Array.from({ length: n + 1 }, (_, i) => vec(-hw + d * (i % 2), -hh + (h * i) / n)).reverse();
      return [...right, ...left];
    },
  }),
  "l-shape": def({ label: "L shape", group: "more", ratio: 1, build: corners([[-1, -1], [-0.3, -1], [-0.3, 0.3], [1, 0.3], [1, 1], [-1, 1]]) }),
  "t-shape": def({ label: "T shape", group: "more", ratio: 1, build: corners([[-1, -1], [1, -1], [1, -0.4], [0.3, -0.4], [0.3, 1], [-0.3, 1], [-0.3, -0.4], [-1, -0.4]]) }),
  "u-shape": def({ label: "U shape", group: "more", ratio: 1, build: corners([[-1, -1], [-0.4, -1], [-0.4, 0.4], [0.4, 0.4], [0.4, -1], [1, -1], [1, 1], [-1, 1]]) }),
  "gothic-arch": def({
    label: "Gothic arch",
    group: "more",
    ratio: 0.6,
    build: drawn(() => [vec(-1, 1), ...arc(1, 0, 2, 2, Math.PI, (4 * Math.PI) / 3, 20), ...arc(-1, 0, 2, 2, (5 * Math.PI) / 3, TAU, 20).slice(1), vec(1, 1)]),
  }),
  "soft-star": def({ label: "Soft star", group: "more", ratio: 1, lock: true, build: drawn(() => radial((t) => 0.75 + 0.25 * Math.cos(5 * (t + Math.PI / 2)), 160)) }),
} as const satisfies Record<string, ShapeDef>;

export type WindowShape = keyof typeof SHAPE_DEFS;
export const WINDOW_SHAPES = Object.keys(SHAPE_DEFS) as WindowShape[];

/** Names shown to people. */
export const WINDOW_SHAPE_LABELS: Readonly<Record<WindowShape, string>> = Object.fromEntries(WINDOW_SHAPES.map((s) => [s, SHAPE_DEFS[s].label])) as Record<WindowShape, string>;

export interface ShapeGroup {
  readonly id: "basic" | "more";
  readonly title: string;
  readonly shapes: readonly WindowShape[];
}
/** The palette groups, in order. */
export const WINDOW_SHAPE_GROUPS: readonly ShapeGroup[] = [
  { id: "basic", title: "Basic Shapes", shapes: WINDOW_SHAPES.filter((s) => SHAPE_DEFS[s].group === "basic") },
  { id: "more", title: "More Shapes", shapes: WINDOW_SHAPES.filter((s) => SHAPE_DEFS[s].group === "more") },
];

/** The shape in a box of `w` x `h` centred on the origin (y down), before the rotation. */
export function shapePolygon(shape: WindowShape, w: number, h: number): Vec2[] {
  return SHAPE_DEFS[shape].build(w, h);
}

/** Whether a new window of this shape keeps its proportions until unlocked. */
export const shapeKeepsRatio = (shape: WindowShape): boolean => Boolean((SHAPE_DEFS[shape] as ShapeDef).lock);
/** Size of a new window of this shape on a panel `pw` x `ph` (`k` shrinks it). */
export function shapeStartSize(shape: WindowShape, pw: number, ph: number, k: number): [number, number] {
  const d = SHAPE_DEFS[shape] as ShapeDef;
  if (d.start) return [pw * d.start[0] * k, ph * d.start[1] * k];
  const side = Math.min(pw, ph) * 0.42 * k;
  return d.ratio >= 1 ? [side * Math.min(d.ratio, 1.6), (side * Math.min(d.ratio, 1.6)) / d.ratio] : [side * d.ratio, side];
}
/** Natural width / height of a shape (for its palette picture). */
export const shapeRatio = (shape: WindowShape): number => (SHAPE_DEFS[shape] as ShapeDef).ratio;
