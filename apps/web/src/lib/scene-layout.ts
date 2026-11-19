import { z } from "zod";
import type { ViewSettings } from "@/lib/view-settings";

/**
 * Template layouts: how the box is shown on the shared template pages ("Sample 1", "Sample 2" ...).
 * A layout is a list of boxes (copies of the same box). Each box has its own place, turn, lean and size, and can be repeated
 * in any direction (copies a step apart, each turned a bit more). The whole group can be mirrored on the floor.
 *
 * All distances are in "box sizes": one unit is the width, height or depth of that box as it stands (after its turn and lean),
 * so a layout fits any box, and `1` is exactly "touching".
 */

/** Ready-made starting points; they only fill in the list of boxes, which the admin then edits freely. */
export const ARRANGEMENTS = [
  { id: "single", label: "Single box", hint: "One box." },
  { id: "row", label: "Side by side", hint: "Boxes in a row, next to each other." },
  { id: "stack", label: "Stack", hint: "Boxes on top of each other." },
  { id: "stagger", label: "Staggered", hint: "Boxes in a diagonal line, each a step behind the one before." },
  { id: "fan", label: "Fan", hint: "Boxes turned a little more each, like a fan." },
  { id: "grid", label: "Grid", hint: "Boxes in rows and columns, lying flat. Look from above." },
  { id: "flat-stack", label: "Flat stack + standing", hint: "A pile of flat boxes with one standing next to it." },
] as const;

export type ArrangementKind = (typeof ARRANGEMENTS)[number]["id"];

/** Most boxes in a layout (before repeating), and most boxes on screen at once. */
export const MAX_ITEMS = 12;
export const MAX_BOXES = 48;
export const MAX_REPEAT = 12;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

/**
 * Copies of a box: a line of `count` boxes, each one a step further than the one before, and `rows` such lines (each row a step
 * further than the one before). Rows make grids; a line alone makes rows, stacks and diagonals.
 */
export const repeatSchema = z.object({
  /** Number of boxes in the line (1 = just the one). */
  count: z.number().int().min(1).max(MAX_REPEAT),
  /** Step to the right, up and towards the viewer, in box sizes (1 = the next box touches). */
  dx: num(-4, 4),
  dy: num(-4, 4),
  dz: num(-4, 4),
  /** Each copy is turned this many degrees more than the one before (spin, lean forward, lean sideways). */
  dYawDeg: num(-90, 90),
  dPitchDeg: num(-90, 90).default(0),
  dRollDeg: num(-90, 90).default(0),
  /** Neighbouring copies lean opposite ways (a zig-zag). */
  alternateLean: z.boolean().default(false),
  /** Number of lines, and the step from one line to the next. */
  rows: z.number().int().min(1).max(MAX_REPEAT).default(1),
  rowDx: num(-4, 4).default(0),
  rowDy: num(-4, 4).default(0),
  rowDz: num(-4, 4).default(0),
});
export type Repeat = z.infer<typeof repeatSchema>;

/** One box of the layout (and its repeats). */
export const boxItemSchema = z.object({
  /** Where the first copy stands, in box sizes: right, up from the floor, towards the viewer. */
  x: num(-12, 12),
  y: num(-5, 12),
  z: num(-12, 12),
  /** Turn around the upright axis, lean forward/back and lean sideways, in degrees. */
  yawDeg: num(-180, 180),
  pitchDeg: num(-180, 180),
  rollDeg: num(-180, 180),
  /** Size, 1 = as designed; and how much wider, taller or deeper than that (for a different shape of box). */
  scale: num(0.2, 3),
  stretchX: num(0.2, 3).default(1),
  stretchY: num(0.2, 3).default(1),
  stretchZ: num(0.2, 3).default(1),
  repeat: repeatSchema,
});
export type BoxItem = z.infer<typeof boxItemSchema>;

export const layoutSpecSchema = z
  .object({
    v: z.literal(2),
    items: z.array(boxItemSchema).min(1).max(MAX_ITEMS),
    /** A reflection of everything in the floor, like a glossy table: `opacity` is how strong it is where the box touches the floor, `fade` how far down it reaches before it is gone (in heights of the group of boxes). */
    mirror: z.object({ on: z.boolean(), opacity: num(0.05, 0.8), fade: num(0.1, 3).default(1) }),
    /** Camera: turn around the boxes, tilt (90 = from above) and zoom. */
    azimuthDeg: num(-180, 180),
    elevationDeg: num(-89, 89),
    zoom: num(0.2, 10),
  })
  .refine((s) => s.items.reduce((n, i) => n + i.repeat.count * i.repeat.rows, 0) <= MAX_BOXES, { message: `At most ${MAX_BOXES} boxes in all.` });
export type LayoutSpec = z.infer<typeof layoutSpecSchema>;

/** The first version of a layout (an arrangement and a few settings); stored layouts of that kind are converted on read. */
const legacySchema = z.object({
  v: z.literal(1),
  kind: z.enum(ARRANGEMENTS.map((a) => a.id) as [ArrangementKind, ...ArrangementKind[]]),
  count: z.number().int().min(1).max(MAX_BOXES),
  columns: z.number().int().min(1).max(MAX_REPEAT),
  gap: num(0, 2),
  turnDeg: num(-90, 90),
  tiltDeg: num(-45, 45),
  azimuthDeg: num(-180, 180),
  elevationDeg: num(-89, 89),
  zoom: num(0.2, 10),
});

const round = (n: number) => Math.round(n * 1000) / 1000;

/** A box with nothing special about it: standing, one copy. */
export function newBoxItem(over: Partial<Omit<BoxItem, "repeat">> & { repeat?: Partial<Repeat> } = {}): BoxItem {
  const { repeat, ...rest } = over;
  return { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1, stretchX: 1, stretchY: 1, stretchZ: 1, ...rest, repeat: { count: 1, dx: 0, dy: 0, dz: 0, dYawDeg: 0, dPitchDeg: 0, dRollDeg: 0, alternateLean: false, rows: 1, rowDx: 0, rowDy: 0, rowDz: 0, ...repeat } };
}

/** What an arrangement is made of: its settings (the ones that matter for that arrangement). */
interface ArrangementOptions {
  count: number;
  columns: number;
  gap: number;
  turnDeg: number;
  tiltDeg: number;
}

const DEFAULTS: Record<ArrangementKind, { options: ArrangementOptions; azimuthDeg: number; elevationDeg: number }> = {
  single: { options: { count: 1, columns: 1, gap: 0, turnDeg: 0, tiltDeg: 0 }, azimuthDeg: 36, elevationDeg: 25 },
  row: { options: { count: 3, columns: 3, gap: 0.15, turnDeg: 0, tiltDeg: 0 }, azimuthDeg: 20, elevationDeg: 14 },
  stack: { options: { count: 3, columns: 1, gap: 0, turnDeg: 12, tiltDeg: 0 }, azimuthDeg: 30, elevationDeg: 22 },
  stagger: { options: { count: 3, columns: 1, gap: 0.15, turnDeg: 8, tiltDeg: 0 }, azimuthDeg: 28, elevationDeg: 24 },
  fan: { options: { count: 3, columns: 1, gap: 0.15, turnDeg: 22, tiltDeg: 0 }, azimuthDeg: 0, elevationDeg: 22 },
  grid: { options: { count: 9, columns: 3, gap: 0.15, turnDeg: 0, tiltDeg: 0 }, azimuthDeg: 0, elevationDeg: 70 },
  "flat-stack": { options: { count: 3, columns: 1, gap: 0.02, turnDeg: 8, tiltDeg: 0 }, azimuthDeg: 28, elevationDeg: 18 },
};

/** The boxes of an arrangement. Centred on the middle of the picture. */
export function arrangementItems(kind: ArrangementKind, o: ArrangementOptions): BoxItem[] {
  const n = kind === "single" ? 1 : o.count;
  const step = 1 + o.gap;
  const mid = (n - 1) / 2;
  const r = (v: BoxItem): BoxItem => ({ ...v, x: round(v.x), y: round(v.y), z: round(v.z), yawDeg: round(v.yawDeg), rollDeg: round(v.rollDeg), repeat: { ...v.repeat, dx: round(v.repeat.dx), dy: round(v.repeat.dy), dz: round(v.repeat.dz) } });
  switch (kind) {
    case "single":
      return [r(newBoxItem({ yawDeg: o.turnDeg, rollDeg: o.tiltDeg }))];
    case "row":
      return [r(newBoxItem({ x: -mid * step, yawDeg: o.turnDeg, rollDeg: o.tiltDeg, repeat: { count: n, dx: step } }))];
    case "stack":
      return [r(newBoxItem({ yawDeg: -mid * o.turnDeg, repeat: { count: n, dy: step, dYawDeg: o.turnDeg } }))];
    case "stagger":
      return [r(newBoxItem({ x: -mid * step * 0.55, z: mid * step * 0.6, yawDeg: o.turnDeg, rollDeg: o.tiltDeg, repeat: { count: n, dx: step * 0.55, dz: -step * 0.6 } }))];
    case "fan": {
      const dx = 0.45 + o.gap * 0.6;
      return [r(newBoxItem({ x: -mid * dx, yawDeg: -mid * o.turnDeg, rollDeg: o.tiltDeg, repeat: { count: n, dx, dYawDeg: o.turnDeg } }))];
    }
    case "grid": {
      const cols = Math.min(o.columns, n);
      const rows = Math.ceil(n / cols);
      return Array.from({ length: rows }, (_, row) => {
        const inRow = Math.min(cols, n - row * cols);
        return r(newBoxItem({ x: -((cols - 1) / 2) * step, z: (row - (rows - 1) / 2) * step, yawDeg: o.turnDeg, repeat: { count: inRow, dx: step } }));
      });
    }
    case "flat-stack":
      return [
        r(newBoxItem({ x: -0.7, pitchDeg: 90, yawDeg: -mid * o.turnDeg, repeat: { count: n, dy: step, dYawDeg: o.turnDeg } })),
        r(newBoxItem({ x: 1.1, z: 0.2, yawDeg: -14 })),
      ];
  }
}

/** Sensible settings for an arrangement: what a new layout starts with. */
export function defaultLayoutSpec(kind: ArrangementKind): LayoutSpec {
  const d = DEFAULTS[kind];
  return { v: 2, items: arrangementItems(kind, d.options), mirror: { on: false, opacity: 0.4, fade: 1 }, azimuthDeg: d.azimuthDeg, elevationDeg: d.elevationDeg, zoom: 1 };
}

/** More ready-made layouts: the boxes are written out, then edited freely like any other. */
const flat = { pitchDeg: 90 };
const SHOWCASE: Record<string, { label: string; hint: string; azimuthDeg: number; elevationDeg: number; zoom?: number; mirror?: boolean; items: BoxItem[] }> = {
  "flat-pile": { label: "Flat pile, offset", hint: "Flat boxes piled up, each turned a little.", azimuthDeg: 24, elevationDeg: 26, items: [newBoxItem({ ...flat, yawDeg: -8, repeat: { count: 3, dy: 1.02, dx: 0.04, dYawDeg: 8 } })] },
  "flat-pair": { label: "Two flat, one lifted", hint: "Two flat boxes, one higher and leaning.", azimuthDeg: 30, elevationDeg: 24, items: [newBoxItem({ ...flat, x: -0.62, yawDeg: 6 }), newBoxItem({ ...flat, x: 0.62, y: 0.7, z: -0.2, yawDeg: -12, rollDeg: -10 })] },
  "floating-trio": { label: "Floating trio", hint: "Three leaning boxes in a diagonal, above the floor.", azimuthDeg: 28, elevationDeg: 22, items: [newBoxItem({ x: -1, y: 0.15, z: 0.6, yawDeg: -20, rollDeg: -8, repeat: { count: 3, dx: 1, dy: 0.12, dz: -0.6, dRollDeg: 1 } })] },
  "leaning-pair": { label: "Leaning pair", hint: "Two boxes floating side by side, leaning in.", azimuthDeg: 18, elevationDeg: 14, items: [newBoxItem({ x: -0.62, y: 0.12, yawDeg: 8, rollDeg: 14 }), newBoxItem({ x: 0.62, y: 0.12, yawDeg: -8, rollDeg: -14 })] },
  zigzag: { label: "Zig-zag", hint: "A row of boxes leaning opposite ways.", azimuthDeg: 18, elevationDeg: 16, items: [newBoxItem({ x: -1.1, rollDeg: 18, repeat: { count: 3, dx: 1.1, alternateLean: true } })] },
  receding: { label: "Receding row", hint: "A row going away from the viewer.", azimuthDeg: 58, elevationDeg: 12, items: [newBoxItem({ x: -1.1, z: 2.2, yawDeg: -8, repeat: { count: 5, dx: 0.55, dz: -1.1 } })] },
  "flat-grid": { label: "Flat grid from above", hint: "Rows and columns of flat boxes. Look from above.", azimuthDeg: 30, elevationDeg: 64, items: [newBoxItem({ ...flat, x: -1.65, z: -1.1, repeat: { count: 4, dx: 1.1, rows: 3, rowDz: 1.1 } })] },
  "diamond-grid": { label: "Diamond grid", hint: "Standing boxes in rows and columns, seen corner-on.", azimuthDeg: 45, elevationDeg: 48, items: [newBoxItem({ x: -1.65, z: -1.65, repeat: { count: 4, dx: 1.1, rows: 4, rowDz: 1.1 } })] },
  scattered: { label: "Scattered flat boxes", hint: "Flat boxes spread out, each turned differently.", azimuthDeg: 20, elevationDeg: 58, items: [newBoxItem({ ...flat, x: -1.2, z: -0.6, yawDeg: 12, repeat: { count: 3, dx: 1.2, dz: 0.3, dYawDeg: -14, rows: 2, rowDz: 1.3, rowDx: 0.5 } })] },
  "tall-and-wide": { label: "Wide and tall", hint: "A wide box next to a tall, narrow one.", azimuthDeg: 20, elevationDeg: 12, items: [newBoxItem({ x: -0.75, yawDeg: 6 }), newBoxItem({ x: 0.85, z: -0.1, yawDeg: -4, stretchX: 0.45, stretchY: 1.15, stretchZ: 0.5 })] },
  "three-sides": { label: "Front, side, back", hint: "Three boxes turned to show different sides.", azimuthDeg: 0, elevationDeg: 10, items: [newBoxItem({ x: -1.2, yawDeg: -45, repeat: { count: 3, dx: 1.2, dYawDeg: 45 } })] },
  "floating-stack": { label: "Floating stack", hint: "A stack of flat boxes in the air, with a shadow below.", azimuthDeg: 26, elevationDeg: 20, items: [newBoxItem({ ...flat, y: 0.5, yawDeg: -6, repeat: { count: 3, dy: 1.25, dYawDeg: 6 } })] },
  "standing-line": { label: "Standing line", hint: "Three boxes in a row, apart.", azimuthDeg: 0, elevationDeg: 8, items: [newBoxItem({ x: -1.4, repeat: { count: 3, dx: 1.4 } })] },
};

/** Every ready-made layout, for the "Start from a preset" list. */
export const PRESETS: { id: string; label: string; hint: string }[] = [
  ...ARRANGEMENTS.map((a) => ({ id: a.id, label: a.label, hint: a.hint })),
  ...Object.entries(SHOWCASE).map(([id, v]) => ({ id, label: v.label, hint: v.hint })),
];

/** The layout of a preset (null if there is no such preset). */
export function presetSpec(id: string): LayoutSpec | null {
  if (ARRANGEMENTS.some((a) => a.id === id)) return defaultLayoutSpec(id as ArrangementKind);
  const v = SHOWCASE[id];
  if (!v) return null;
  return { v: 2, items: v.items, mirror: { on: v.mirror ?? false, opacity: 0.4, fade: 1 }, azimuthDeg: v.azimuthDeg, elevationDeg: v.elevationDeg, zoom: v.zoom ?? 1 };
}

/** A starting set of layouts, for an admin who has none yet. */
export const STARTER_LAYOUTS: { name: string; spec: LayoutSpec }[] = [
  { name: "Single", spec: defaultLayoutSpec("single") },
  { name: "Side by side", spec: { ...defaultLayoutSpec("row"), items: arrangementItems("row", { ...DEFAULTS.row.options, count: 2, gap: 0.2, turnDeg: -16 }), azimuthDeg: 24 } },
  { name: "Trio", spec: defaultLayoutSpec("row") },
  { name: "Stack", spec: defaultLayoutSpec("stack") },
  { name: "Flat stack", spec: { ...defaultLayoutSpec("flat-stack"), mirror: { on: true, opacity: 0.4, fade: 1 } } },
  { name: "Fan", spec: defaultLayoutSpec("fan") },
  { name: "Grid", spec: defaultLayoutSpec("grid") },
];

/** One box on screen: where it stands (box sizes), how it is turned (degrees), its size, and which item of the layout it comes from. */
export interface LayoutInstance {
  item: number;
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  scale: number;
  stretch: [number, number, number];
}

/** Every box on screen: each item's lines and rows of copies, one step after the other. */
export function layoutInstances(spec: LayoutSpec): LayoutInstance[] {
  const out: LayoutInstance[] = [];
  spec.items.forEach((it, item) => {
    const r = it.repeat;
    for (let row = 0; row < r.rows; row++) {
      for (let i = 0; i < r.count; i++) {
        const sign = r.alternateLean && (i + row) % 2 === 1 ? -1 : 1;
        out.push({
          item,
          x: round(it.x + i * r.dx + row * r.rowDx),
          y: round(it.y + i * r.dy + row * r.rowDy),
          z: round(it.z + i * r.dz + row * r.rowDz),
          yawDeg: round(it.yawDeg + i * r.dYawDeg),
          pitchDeg: round(sign * (it.pitchDeg + i * r.dPitchDeg)),
          rollDeg: round(sign * (it.rollDeg + i * r.dRollDeg)),
          scale: it.scale,
          stretch: [it.stretchX, it.stretchY, it.stretchZ],
        });
      }
    }
  });
  return out;
}

/** The camera a layout asks for, as a view of the 3D box (fold amount taken from the current fold). */
export function layoutView(spec: LayoutSpec, progress: number): ViewSettings {
  return { v: 1, azimuthDeg: spec.azimuthDeg, elevationDeg: spec.elevationDeg, rollDeg: 0, zoom: spec.zoom, panX: 0, panY: 0, panZ: 0, progress };
}

/** A stored layout that may be missing, damaged or from the first version: the layout, or null. */
export function readLayoutSpec(raw: unknown): LayoutSpec | null {
  const p = layoutSpecSchema.safeParse(raw);
  if (p.success) return p.data;
  const old = legacySchema.safeParse(raw);
  if (!old.success) return null;
  const l = old.data;
  return {
    v: 2,
    items: arrangementItems(l.kind, l),
    mirror: { on: false, opacity: 0.4, fade: 1 },
    azimuthDeg: l.azimuthDeg,
    elevationDeg: l.elevationDeg,
    zoom: l.zoom,
  };
}

/** A layout as the pages receive it. */
export interface LayoutItem {
  id: string;
  name: string;
  /** Switched on for customers. */
  active: boolean;
  spec: LayoutSpec;
  /** Address of the layout's icon (a small 3D picture the admin took), or null. */
  iconUrl: string | null;
}
