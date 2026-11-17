import { checkCustomLoops, fitLoops, isCustomShape, isGridShape, simplifyLoop, windowPolygon, type PathAnchor, type WindowSpec } from "@packaging/dieline-engine";
import { flattenPath, type Anchor, type Pt } from "./window-pen";

/**
 * "Edit points": a window shape opened as a path of anchors (like the pen tool's), edited, and turned back into a window.
 * Anchors are in the sheet's frame while editing; stored with the window in its own box (`path`).
 */

const K = 0.5522847498; // handle length of a circle quarter, as a share of the radius

type Spec = Pick<WindowSpec, "shape" | "cx" | "cy" | "width" | "height" | "rotation" | "loops" | "path" | "rows" | "cols" | "bar">;

/** Box -> sheet frame: turn, then move to the window's centre. */
const toSheet = (win: Pick<WindowSpec, "cx" | "cy" | "width" | "height" | "rotation">) => {
  const a = (win.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (p: Pt): Pt => ({ x: win.cx + p.x * cos - p.y * sin, y: win.cy + p.x * sin + p.y * cos });
};

const corner = (p: Pt): Anchor => ({ x: p.x, y: p.y, hin: null, hout: null, smooth: false });

/** The window as anchors in the sheet's frame, or null when it is not one path (a grid, or a shape of several pieces). */
export function anchorsOf(win: Spec): Anchor[] | null {
  if (isGridShape(win.shape)) return null;
  const place = toSheet(win);
  if (isCustomShape(win.shape)) {
    if (win.path && win.path.length >= 3) {
      const at = (h: readonly [number, number] | null | undefined): Pt | null => (h ? place({ x: h[0] * win.width, y: h[1] * win.height }) : null);
      return win.path.map((a) => ({ ...place({ x: a.x * win.width, y: a.y * win.height }), hin: at(a.hin), hout: at(a.hout), smooth: Boolean(a.smooth) }));
    }
    if (!win.loops || win.loops.length !== 1) return null;
    const loop = win.loops[0]!;
    const pts: Pt[] = Array.from({ length: loop.length / 2 }, (_, i) => place({ x: loop[i * 2]! * win.width, y: loop[i * 2 + 1]! * win.height }));
    return reduce(pts, Math.max(win.width, win.height)).map(corner);
  }
  if (win.shape === "circle" || win.shape === "ellipse") {
    const rx = win.width / 2;
    const ry = win.height / 2;
    const smooth = (x: number, y: number, inX: number, inY: number): Anchor => {
      const a = place({ x, y });
      return { ...a, hin: place({ x: inX, y: inY }), hout: place({ x: 2 * x - inX, y: 2 * y - inY }), smooth: true };
    };
    // Right, bottom, left, top (clockwise on screen); the handle before each point lies on the way from the previous one.
    return [smooth(rx, 0, rx, -K * ry), smooth(0, ry, K * rx, ry), smooth(-rx, 0, -rx, K * ry), smooth(0, -ry, -K * rx, -ry)];
  }
  return reduce(windowPolygon(win), Math.max(win.width, win.height)).map(corner);
}

/** Drop points that add nothing (a straight run, tiny steps of an arc) so there is something to edit. */
function reduce(pts: readonly Pt[], size: number): Pt[] {
  let eps = size * 0.002;
  let out = simplifyLoop(pts, eps);
  while (out.length > 60 && eps < size * 0.1) {
    eps *= 1.6;
    out = simplifyLoop(pts, eps);
  }
  return out.length >= 3 ? out : [...pts];
}

export interface EditedWindow {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: 0;
  readonly shape: "custom";
  readonly loops: number[][];
  readonly path: PathAnchor[];
}

/** The edited anchors (sheet frame) as a window: its outline, its box, and the path in that box. Null when it cannot be cut (and why). */
export function windowFromAnchors(anchors: readonly Anchor[], minSize: number): { window: EditedWindow } | { error: string } {
  if (anchors.length < 3) return { error: "A shape needs at least three points." };
  const fitted = fitLoops([flattenPath(anchors, true)]);
  if (!fitted || fitted.width < minSize || fitted.height < minSize) return { error: `Too small: each side must be at least ${minSize} mm.` };
  const bad = checkCustomLoops(fitted.loops);
  if (bad) return { error: bad };
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  const norm = (p: Pt): [number, number] => [r((p.x - fitted.cx) / fitted.width), r((p.y - fitted.cy) / fitted.height)];
  const path: PathAnchor[] = anchors.map((a) => {
    const [x, y] = norm(a);
    return { x, y, hin: a.hin ? norm(a.hin) : null, hout: a.hout ? norm(a.hout) : null, smooth: a.smooth };
  });
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return { window: { cx: round3(fitted.cx), cy: round3(fitted.cy), width: round3(fitted.width), height: round3(fitted.height), rotation: 0, shape: "custom", loops: fitted.loops, path } };
}
