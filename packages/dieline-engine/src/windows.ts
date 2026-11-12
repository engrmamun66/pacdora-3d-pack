import type { DielineGeometry } from "./geometry-types";
import type { Panel } from "./fold-tree/types";
import { flattenOutline, type Outline } from "./primitives/arc";
import { area, bounds, intersectionArea, offsetPolygon } from "./primitives/polygon";
import { type Vec2, vec } from "./primitives/vec2";

/**
 * Window holes: shapes cut through one panel of a folded dieline (a window in a box lid, a circle in a wall...).
 *
 * A window is stored as plain numbers in the sheet's frame (mm, y down, the frame of `DielineGeometry`): the centre,
 * the width and height of its box, a rotation. `applyWindows` turns the valid ones into holes of the panel they lie in
 * (`Panel.holes`, and extra closed cut loops, so every export draws them as cut lines) and reports the others.
 *
 * Rules (checked, never assumed): a window lies fully inside ONE panel with at least `WINDOW_MARGIN` mm to that panel's
 * edges (cut edges and folds alike), at least `WINDOW_GAP` mm to every other window and to holes the drawing already has,
 * and is at least `WINDOW_MIN_SIZE` mm in both directions.
 */

export const WINDOW_SHAPES = ["rectangle", "rounded-rectangle", "circle", "ellipse", "stadium", "arch", "diamond", "hexagon", "star", "heart"] as const;
export type WindowShape = (typeof WINDOW_SHAPES)[number];

/** Names shown to people. */
export const WINDOW_SHAPE_LABELS: Readonly<Record<WindowShape, string>> = {
  rectangle: "Rectangle",
  "rounded-rectangle": "Rounded rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  stadium: "Pill",
  arch: "Arch",
  diamond: "Diamond",
  hexagon: "Hexagon",
  star: "Star",
  heart: "Heart",
};

export const MAX_WINDOWS = 24;
export const WINDOW_MIN_SIZE = 3;
export const WINDOW_MAX_SIZE = 2000;
/** Distance (mm) a window keeps from the edges of its panel, and from a hole of the drawing. */
export const WINDOW_MARGIN = 2;
/** Distance (mm) between two windows. */
export const WINDOW_GAP = 2;

export interface WindowSpec {
  readonly id: string;
  readonly shape: WindowShape;
  /** Centre, in the sheet's frame (mm). */
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  /** Degrees, clockwise on screen. */
  readonly rotation: number;
}

export interface WindowProblem {
  readonly id: string;
  readonly message: string;
}

export interface WindowResult {
  /** The geometry with the valid windows cut (the same object when there is nothing to cut). */
  readonly geo: DielineGeometry;
  readonly problems: readonly WindowProblem[];
  /** Ids of the windows that were cut. */
  readonly applied: readonly string[];
  /** The hole polygon of every applied window (sheet frame). */
  readonly polygons: Readonly<Record<string, readonly Vec2[]>>;
  /** Which panel each applied window lies in. */
  readonly panelOf: Readonly<Record<string, string>>;
}

/** Points on an elliptical arc (centre, radii, angles in radians). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push(vec(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
}

/** The shape in a box of `w` x `h` centred on the origin (y down), before the rotation. */
function basePolygon(shape: WindowShape, w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  switch (shape) {
    case "rectangle":
      return [vec(-hw, -hh), vec(hw, -hh), vec(hw, hh), vec(-hw, hh)];
    case "rounded-rectangle": {
      const r = Math.min(w, h) * 0.2;
      return [
        ...arc(hw - r, -hh + r, r, r, -Math.PI / 2, 0, 8),
        ...arc(hw - r, hh - r, r, r, 0, Math.PI / 2, 8),
        ...arc(-hw + r, hh - r, r, r, Math.PI / 2, Math.PI, 8),
        ...arc(-hw + r, -hh + r, r, r, Math.PI, (3 * Math.PI) / 2, 8),
      ];
    }
    case "circle":
    case "ellipse":
      return arc(0, 0, hw, hh, 0, 2 * Math.PI, 72).slice(0, -1);
    case "stadium": {
      if (w >= h) {
        const r = hh;
        return [...arc(hw - r, 0, r, r, -Math.PI / 2, Math.PI / 2, 18), ...arc(-hw + r, 0, r, r, Math.PI / 2, (3 * Math.PI) / 2, 18)];
      }
      const r = hw;
      return [...arc(0, hh - r, r, r, 0, Math.PI, 18), ...arc(0, -hh + r, r, r, Math.PI, 2 * Math.PI, 18)];
    }
    case "arch": {
      // Flat bottom, a half circle on top (the radius shrinks when the box is lower than half its width).
      const r = Math.min(hw, h);
      const rx = hw;
      const ry = r;
      return [vec(-hw, hh), vec(-hw, -hh + ry), ...arc(0, -hh + ry, rx, ry, Math.PI, 2 * Math.PI, 36).slice(1, -1), vec(hw, -hh + ry), vec(hw, hh)];
    }
    case "diamond":
      return [vec(0, -hh), vec(hw, 0), vec(0, hh), vec(-hw, 0)];
    case "hexagon":
      return [vec(-hw, 0), vec(-hw / 2, -hh), vec(hw / 2, -hh), vec(hw, 0), vec(hw / 2, hh), vec(-hw / 2, hh)];
    case "star": {
      const pts: Vec2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const k = i % 2 === 0 ? 1 : 0.4;
        pts.push(vec(hw * k * Math.cos(a), hh * k * Math.sin(a)));
      }
      // The star's own box is not square: scale it so the points touch the box.
      const b = bounds(pts);
      const sx = w / (b.max.x - b.min.x);
      const sy = h / (b.max.y - b.min.y);
      const cx = (b.max.x + b.min.x) / 2;
      const cy = (b.max.y + b.min.y) / 2;
      return pts.map((p) => vec((p.x - cx) * sx, (p.y - cy) * sy));
    }
    case "heart": {
      const pts: Vec2[] = [];
      for (let i = 0; i < 96; i++) {
        const t = (i / 96) * 2 * Math.PI;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push(vec(x, y));
      }
      const b = bounds(pts);
      const sx = w / (b.max.x - b.min.x);
      const sy = h / (b.max.y - b.min.y);
      const cx = (b.max.x + b.min.x) / 2;
      const cy = (b.max.y + b.min.y) / 2;
      return pts.map((p) => vec((p.x - cx) * sx, (p.y - cy) * sy));
    }
  }
}

/** The window as a polygon in the sheet's frame. */
export function windowPolygon(win: Pick<WindowSpec, "shape" | "cx" | "cy" | "width" | "height" | "rotation">): Vec2[] {
  const a = (win.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return basePolygon(win.shape, win.width, win.height).map((p) => vec(win.cx + p.x * cos - p.y * sin, win.cy + p.x * sin + p.y * cos));
}

const panelPolygon = (panel: Panel): Vec2[] => flattenOutline({ points: panel.polygon, ...(panel.bulges ? { bulges: panel.bulges } : {}) });

/** True if `inner` lies inside `outer` (a sliver of tolerance for rounding). */
const inside = (inner: readonly Vec2[], outer: readonly Vec2[]): boolean => {
  const a = area(inner);
  return a > 0 && intersectionArea(inner, outer) >= a * (1 - 1e-6) - 1e-6;
};

/** Grow a polygon by `d` mm (one polygon back; the shapes here stay in one piece). */
const grow = (poly: readonly Vec2[], d: number): Vec2[] => offsetPolygon(poly, d)[0] ?? [...poly];

/** Shape and numbers only: no geometry needed. */
export function checkWindowSpec(w: WindowSpec): string | null {
  if (!(WINDOW_SHAPES as readonly string[]).includes(w.shape)) return "Unknown shape.";
  for (const [name, v] of [["centre x", w.cx], ["centre y", w.cy], ["width", w.width], ["height", w.height], ["rotation", w.rotation]] as const) {
    if (!Number.isFinite(v)) return `The ${name} is not a number.`;
  }
  if (w.width < WINDOW_MIN_SIZE || w.height < WINDOW_MIN_SIZE) return `Too small: each side must be at least ${WINDOW_MIN_SIZE} mm.`;
  if (w.width > WINDOW_MAX_SIZE || w.height > WINDOW_MAX_SIZE) return `Too big: each side must be at most ${WINDOW_MAX_SIZE} mm.`;
  return null;
}

/**
 * Cut the windows into the geometry. A window that breaks a rule is left out and reported (the geometry stays valid).
 * Pure: the input geometry is not changed.
 */
export function applyWindows(geo: DielineGeometry, windows: readonly WindowSpec[]): WindowResult {
  const problems: WindowProblem[] = [];
  const applied: string[] = [];
  const polygons: Record<string, Vec2[]> = {};
  const panelOf: Record<string, string> = {};
  if (windows.length === 0) return { geo, problems, applied, polygons, panelOf };

  if (windows.length > MAX_WINDOWS) problems.push({ id: "", message: `At most ${MAX_WINDOWS} windows.` });
  const panels = geo.foldTree.panels.map((p) => ({ panel: p, poly: panelPolygon(p) }));
  // Holes the drawing already has (inner closed cut loops) are kept clear too.
  const existing = geo.cutLoops.slice(1).map((o: Outline) => flattenOutline(o));
  const taken: { id: string; poly: Vec2[] }[] = [];

  for (const w of windows.slice(0, MAX_WINDOWS)) {
    const bad = checkWindowSpec(w);
    if (bad) {
      problems.push({ id: w.id, message: bad });
      continue;
    }
    const poly = windowPolygon(w);
    const host = panels.find((q) => inside(poly, q.poly));
    if (!host) {
      // Say why: on no panel at all, across a fold or an edge, or too close to the edge.
      const touching = panels.filter((q) => intersectionArea(poly, q.poly) > 1e-6);
      problems.push({
        id: w.id,
        message: touching.length === 0 ? "Not on the dieline: move it onto a panel." : touching.length > 1 ? "Crosses a fold or an edge: keep it inside one panel." : "Sticks out of its panel: move it inside.",
      });
      continue;
    }
    if (!inside(grow(poly, WINDOW_MARGIN), host.poly)) {
      problems.push({ id: w.id, message: `Too close to the edge of its panel: keep at least ${WINDOW_MARGIN} mm free.` });
      continue;
    }
    const grown = grow(poly, WINDOW_GAP);
    const clash = taken.find((t) => intersectionArea(grown, t.poly) > 1e-6);
    if (clash) {
      problems.push({ id: w.id, message: `Too close to another window (keep at least ${WINDOW_GAP} mm between them).` });
      continue;
    }
    if (existing.some((e) => intersectionArea(grow(poly, WINDOW_MARGIN), e) > 1e-6)) {
      problems.push({ id: w.id, message: "Too close to a hole the dieline already has." });
      continue;
    }
    taken.push({ id: w.id, poly });
    applied.push(w.id);
    polygons[w.id] = poly;
    panelOf[w.id] = host.panel.id;
  }
  if (applied.length === 0) return { geo, problems, applied, polygons, panelOf };

  const holesByPanel = new Map<string, Vec2[][]>();
  for (const id of applied) holesByPanel.set(panelOf[id]!, [...(holesByPanel.get(panelOf[id]!) ?? []), polygons[id]!]);
  const next: DielineGeometry = {
    ...geo,
    cutLoops: [...geo.cutLoops, ...applied.map((id): Outline => ({ points: polygons[id]! }))],
    foldTree: {
      ...geo.foldTree,
      panels: geo.foldTree.panels.map((p) => (holesByPanel.has(p.id) ? { ...p, holes: [...(p.holes ?? []), ...holesByPanel.get(p.id)!] } : p)),
    },
    checks: [...geo.checks, { name: "Window holes", pass: true, detail: `${applied.length} ${applied.length === 1 ? "window" : "windows"}, each inside one panel, clear of folds and edges` }],
  };
  return { geo: next, problems, applied, polygons, panelOf };
}
