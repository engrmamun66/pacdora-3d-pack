import type { DielineGeometry } from "./geometry-types";
import type { Panel } from "./fold-tree/types";
import { flattenOutline, type Outline } from "./primitives/arc";
import { area, bounds, intersectionArea, offsetPolygon } from "./primitives/polygon";
import { type Vec2, vec } from "./primitives/vec2";
import { checkCustomLoops, customHoles, isCustomShape } from "./window-custom";
import { WINDOW_SHAPES, checkGrid, gridHoles, gridParams, isGridShape, shapePolygon, type WindowShape } from "./window-shapes";

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

export { CUSTOM_MAX_LOOPS, CUSTOM_MAX_POINTS, checkCustomLoops, fitLoops, isCustomShape, isSimpleLoop, maskToLoops, simplifyLoop, smoothLoop, traceMask, type FittedLoops } from "./window-custom";
export { GRID_DEFAULTS, GRID_MAX_BAR, GRID_MAX_LINES, GRID_MIN_CELL, WINDOW_SHAPES, WINDOW_SHAPE_GROUPS, WINDOW_SHAPE_LABELS, gridParams, isGridShape, shapeKeepsRatio, shapeRatio, shapeStartSize, type GridParams, type ShapeGroup, type WindowShape } from "./window-shapes";

export const MAX_WINDOWS = 24;
export const WINDOW_MIN_SIZE = 3;
export const WINDOW_MAX_SIZE = 2000;
/** Distance (mm) a window keeps from the edges of its panel, and from a hole of the drawing. */
export const WINDOW_MARGIN = 2;
/** Distance (mm) between two windows. */
export const WINDOW_GAP = 2;

/** One point of a drawn path: its place, the handles of the curves on both sides, and whether the handles stay in one line. */
export interface PathAnchor {
  readonly x: number;
  readonly y: number;
  readonly hin?: readonly [number, number] | null;
  readonly hout?: readonly [number, number] | null;
  readonly smooth?: boolean;
}

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
  /** Only for the "grid" shape: the number of rows and columns of holes, and the width of the bars between them (mm). Missing = the defaults. */
  readonly rows?: number;
  readonly cols?: number;
  readonly bar?: number;
  /**
   * Only for the "custom" shape made with the pen tool or "Edit points": the anchors of the path, in the window's box (both axes from
   * about -0.5 to 0.5), so it can be edited again. The cut outline is `loops`; the engine only reads `loops`.
   */
  readonly path?: readonly PathAnchor[];
  /** Only for the "custom" shape: the outline(s), `x, y, x, y, ...` with both axes from -0.5 to 0.5 in the window's box. */
  readonly loops?: readonly (readonly number[])[];
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

/** The window as a polygon in the sheet's frame. */
export function windowPolygon(win: Pick<WindowSpec, "shape" | "cx" | "cy" | "width" | "height" | "rotation">): Vec2[] {
  const a = (win.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return shapePolygon(win.shape, win.width, win.height).map((p) => vec(win.cx + p.x * cos - p.y * sin, win.cy + p.x * sin + p.y * cos));
}

/**
 * What is really cut for a window, in the sheet's frame: one polygon for most shapes, the many small holes of a grid.
 * (`windowPolygon` is the outline of the whole window: the box of a grid.)
 */
export function windowHoles(win: Pick<WindowSpec, "shape" | "cx" | "cy" | "width" | "height" | "rotation" | "rows" | "cols" | "bar" | "loops">): Vec2[][] {
  if (!isGridShape(win.shape) && !isCustomShape(win.shape)) return [windowPolygon(win)];
  const a = (win.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const holes = isCustomShape(win.shape) ? customHoles(win.width, win.height, win.loops) : gridHoles(win.width, win.height, gridParams(win));
  return holes.map((hole) => hole.map((p) => vec(win.cx + p.x * cos - p.y * sin, win.cy + p.x * sin + p.y * cos)));
}

const panelPolygon = (panel: Panel): Vec2[] => flattenOutline({ points: panel.polygon, ...(panel.bulges ? { bulges: panel.bulges } : {}) });

/** True if `inner` lies inside `outer` (a sliver of tolerance for rounding). */
const inside = (inner: readonly Vec2[], outer: readonly Vec2[]): boolean => {
  // Clipper works on a fine integer grid, so the area of `inner` is measured the same way: a rotated window would
  // otherwise lose a hair of area to rounding and look as if it stuck out.
  const a = intersectionArea(inner, inner);
  return a > 0 && intersectionArea(inner, outer) >= a - Math.max(1e-6 * a, 0.01);
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
  if (isCustomShape(w.shape)) return checkCustomLoops(w.loops);
  if (isGridShape(w.shape)) {
    for (const [name, v] of [["rows", w.rows], ["columns", w.cols], ["bar", w.bar]] as const) {
      if (v !== undefined && !Number.isFinite(v)) return `The ${name} is not a number.`;
    }
    return checkGrid(w.width, w.height, gridParams(w));
  }
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
  const holesOf: Record<string, Vec2[][]> = {};
  const panelOf: Record<string, string> = {};
  if (windows.length === 0) return { geo, problems, applied, polygons, panelOf };

  if (windows.length > MAX_WINDOWS) problems.push({ id: "", message: `At most ${MAX_WINDOWS} windows.` });
  const panels = geo.foldTree.panels.map((p) => ({ panel: p, poly: panelPolygon(p) }));
  // Holes the drawing already has are kept clear too. A cut loop is a hole when it lies inside an odd number of other loops:
  // the outline of a second piece (a lid next to the box) is a loop of its own, not a hole.
  const loops = geo.cutLoops.map((o: Outline) => flattenOutline(o));
  const existing = loops.filter((l, i) => loops.filter((o, j) => j !== i && inside(l, o)).length % 2 === 1);
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
    holesOf[w.id] = windowHoles(w);
    panelOf[w.id] = host.panel.id;
  }
  if (applied.length === 0) return { geo, problems, applied, polygons, panelOf };

  const holesByPanel = new Map<string, Vec2[][]>();
  for (const id of applied) holesByPanel.set(panelOf[id]!, [...(holesByPanel.get(panelOf[id]!) ?? []), ...holesOf[id]!]);
  const next: DielineGeometry = {
    ...geo,
    cutLoops: [...geo.cutLoops, ...applied.flatMap((id) => holesOf[id]!.map((points): Outline => ({ points })))],
    foldTree: {
      ...geo.foldTree,
      panels: geo.foldTree.panels.map((p) => (holesByPanel.has(p.id) ? { ...p, holes: [...(p.holes ?? []), ...holesByPanel.get(p.id)!] } : p)),
    },
    checks: [...geo.checks, { name: "Window holes", pass: true, detail: `${applied.length} ${applied.length === 1 ? "window" : "windows"}, each inside one panel, clear of folds and edges` }],
  };
  return { geo: next, problems, applied, polygons, panelOf };
}
