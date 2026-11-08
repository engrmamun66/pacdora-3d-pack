import { type Vec2, vec, nearlyEqual } from "../primitives/vec2";
import { area, bounds, offsetOutline, outlineBounds } from "../primitives/polygon";
import { flattenOutline, roundCorners } from "../primitives/arc";
import type { FoldTree, Hinge, LinearAnnotation, Panel, PanelRole, Slit } from "../fold-tree/types";
import { DielineBuildError, extractLines, panelOutline } from "../fold-tree/extract";
import { type DielineGeometry, DielineValidationError, type SafeArea } from "../geometry-types";
import { runChecks } from "../validate/checks";
import { ParamValidationError, effectiveDims, resolveTuckEndParams, sheetOrigin, type TuckEndParams } from "./tuck-end-params";

export const TUCK_END_TEMPLATE_ID = "tuck-end-carton";
export const ENGINE_VERSION = "0.2.0";

/** Remove consecutive duplicate points (e.g. zero corner cut). */
function poly(...pts: Vec2[]): Vec2[] {
  return pts.filter((p, i) => !nearlyEqual(p, pts[(i + 1) % pts.length]!));
}

/** Round the given corners; a radius that does not fit becomes a parameter error. */
function rounded(param: string, points: Vec2[], radii: number[]): { polygon: Vec2[]; bulges?: number[] } {
  if (radii.every((r) => r <= 0)) return { polygon: points };
  try {
    const r = roundCorners(points, radii);
    return { polygon: r.points, bulges: r.bulges };
  } catch (e) {
    throw new ParamValidationError([{ path: param, message: (e as Error).message }]);
  }
}

/**
 * Build the fold tree of a tuck-end carton.
 *
 * Layout (x direction): [glue flap][front L][right W][back L][left W], each
 * body panel H tall. Top closure + tuck hang from the back panel; the bottom
 * closure + tuck hang from the back (straight) or front (reverse) panel.
 * Dust flaps hang from both side panels, top and bottom. Optional tuck slits
 * shorten the tuck crease at both ends.
 */
export function buildTuckEndTree(p: TuckEndParams): FoldTree {
  const { L, W, H } = effectiveDims(p);
  const { glueFlapWidth: g, glueFlapBevel: gb, tuckDepth: t, tuckCornerCut: c, dustFlapDepth: d, dustFlapInset: s } = p;
  const sl = p.tuckSlitLength;
  const o = sheetOrigin(p);
  const P = (x: number, y: number): Vec2 => vec(x + o.x, y + o.y);

  const panels: Panel[] = [];
  const hinges: Hinge[] = [];
  const slits: Slit[] = [];
  const addPanel = (id: string, role: PanelRole, label: string, shape: { polygon: Vec2[]; bulges?: number[] }, printable: boolean) =>
    panels.push({ id, role, label, polygon: shape.polygon, ...(shape.bulges ? { bulges: shape.bulges } : {}), printable });
  const addHinge = (child: string, parent: string, a: Vec2, b: Vec2) =>
    hinges.push({ id: `h-${child}`, parentId: parent, childId: child, a, b, foldAngleDeg: 90 });

  // Body panels.
  const bodyX = { front: 0, right: L, back: L + W, left: 2 * L + W } as const;
  const bodyW = { front: L, right: W, back: L, left: W } as const;
  type Body = keyof typeof bodyX;
  for (const id of ["front", "right", "back", "left"] as Body[]) {
    const x = bodyX[id];
    const w = bodyW[id];
    addPanel(id, "body", id, { polygon: poly(P(x, 0), P(x + w, 0), P(x + w, H), P(x, H)) }, true);
  }
  addHinge("right", "front", P(L, 0), P(L, H));
  addHinge("back", "right", P(L + W, 0), P(L + W, H));
  addHinge("left", "back", P(2 * L + W, 0), P(2 * L + W, H));

  // Glue flap on the free left edge of the front panel.
  addPanel("glue", "glue-flap", "glue flap", { polygon: poly(P(0, 0), P(0, H), P(-g, H - gb), P(-g, gb)) }, false);
  addHinge("glue", "front", P(0, 0), P(0, H));

  /**
   * Closure (L x W) on a body edge at y = y0, plus its tuck flap (L x t).
   * dir = -1 grows upward (top), +1 downward (bottom).
   */
  const closure = (which: "top" | "bottom", host: Body, y0: number, dir: -1 | 1) => {
    const x = bodyX[host];
    const yf = y0 + dir * W; // far edge of the closure = tuck crease line
    const yt = yf + dir * t; // free edge of the tuck
    const crease = sl > 0 ? [P(x + L - sl, yf), P(x + sl, yf)] : [];
    addPanel(`${which}-closure`, "closure", `${which} closure`, { polygon: poly(P(x, y0), P(x + L, y0), P(x + L, yf), ...crease, P(x, yf)) }, true);
    addHinge(`${which}-closure`, host, P(x, y0), P(x + L, y0));

    const creaseT = sl > 0 ? [P(x + sl, yf), P(x + L - sl, yf)] : [];
    let tuck: { polygon: Vec2[]; bulges?: number[] };
    if (p.tuckCornerStyle === "chamfer" || c === 0) {
      tuck = {
        polygon: poly(P(x, yf), ...creaseT, P(x + L, yf), P(x + L, yt - dir * c), P(x + L - c, yt), P(x + c, yt), P(x, yt - dir * c)),
      };
    } else {
      const base = [P(x, yf), ...creaseT, P(x + L, yf), P(x + L, yt), P(x, yt)];
      const radii = base.map((_, i) => (i >= base.length - 2 ? c : 0));
      tuck = rounded("tuckCornerCut", base, radii);
    }
    addPanel(`${which}-tuck`, "tuck", `${which} tuck`, tuck, true);
    addHinge(`${which}-tuck`, `${which}-closure`, P(x + sl, yf), P(x + L - sl, yf));
    if (sl > 0) {
      slits.push({ id: `slit-${which}-a`, a: P(x, yf), b: P(x + sl, yf) });
      slits.push({ id: `slit-${which}-b`, a: P(x + L - sl, yf), b: P(x + L, yf) });
    }
  };
  closure("top", "back", 0, -1);
  closure("bottom", p.variant === "straight" ? "back" : "front", H, 1);

  // Dust flaps (W wide at the hinge, d deep, free edge inset by s, corners rounded).
  const r = p.dustFlapCornerRadius;
  for (const host of ["right", "left"] as const) {
    const x = bodyX[host];
    for (const [pos, y0, dir] of [["top", 0, -1], ["bottom", H, 1]] as const) {
      const id = `dust-${host}-${pos}`;
      const base = [P(x, y0), P(x + W, y0), P(x + W - s, y0 + dir * d), P(x + s, y0 + dir * d)];
      addPanel(id, "dust-flap", `dust ${host} ${pos}`, rounded("dustFlapCornerRadius", base, [0, 0, r, r]), false);
      addHinge(id, host, P(x, y0), P(x + W, y0));
    }
  }

  return { rootId: "front", panels, hinges, slits };
}

const fmt = (n: number): string => n.toFixed(2);

/** Validate params, build the flat dieline, run all checks. Never returns invalid geometry. */
export function generateTuckEndCarton(input: unknown): DielineGeometry {
  const { params, unverifiedDefaultsUsed } = resolveTuckEndParams(input);
  const tree = buildTuckEndTree(params);
  const lines = extractLines(tree);
  const outer = lines.cutLoops[0];
  if (!outer) throw new DielineBuildError("No cut outline produced.");

  let bleedLoop: readonly Vec2[] = flattenOutline(outer);
  let bleedPieces = 1;
  if (params.bleed > 0) {
    const pieces = offsetOutline(outer, params.bleed);
    bleedPieces = pieces.length;
    const largest = [...pieces].sort((a, b) => area(b) - area(a))[0];
    if (!largest) throw new DielineBuildError("Bleed offset produced no outline.");
    bleedLoop = largest;
  }

  const safeAreas: SafeArea[] = [];
  for (const panel of tree.panels) {
    if (!panel.printable) continue;
    if (params.safeMargin === 0) {
      safeAreas.push({ panelId: panel.id, polygon: flattenOutline(panelOutline(panel)) });
      continue;
    }
    const inset = offsetOutline(panelOutline(panel), -params.safeMargin);
    if (inset.length !== 1) {
      throw new ParamValidationError([
        { path: "safeMargin", message: `too large for panel "${panel.id}" (its safe area would vanish or split)` },
      ]);
    }
    safeAreas.push({ panelId: panel.id, polygon: inset[0]! });
  }

  const cutBounds = outlineBounds(outer);
  const bleedBounds = bounds(bleedLoop);
  const { L, W, H } = effectiveDims(params);
  const o = sheetOrigin(params);
  const annotations = buildAnnotations(params, { L, W, H }, o, cutBounds);

  const checks = runChecks({ params, tree, lines, bleedLoop, bleedPieces, cutBounds, bleedBounds });
  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) throw new DielineValidationError(failed);

  return {
    unit: "mm",
    templateId: TUCK_END_TEMPLATE_ID,
    engineVersion: ENGINE_VERSION,
    params,
    unverifiedDefaultsUsed,
    foldTree: tree,
    cutLoops: lines.cutLoops,
    slitLines: lines.slitLines,
    creaseLines: lines.creaseLines,
    glueAreas: lines.glueAreas,
    bleedLoop,
    safeAreas,
    annotations,
    cutBounds,
    bleedBounds,
    checks,
  };
}

function buildAnnotations(
  p: TuckEndParams,
  { L, W, H }: { L: number; W: number; H: number },
  o: Vec2,
  cb: { min: Vec2; max: Vec2 },
): LinearAnnotation[] {
  const out: LinearAnnotation[] = [];
  const row1 = p.bleed + 6;
  const row2 = p.bleed + 14;
  const xs = [0, L, L + W, 2 * L + W, 2 * L + 2 * W];
  const names = ["Width", "Depth", "Width", "Depth"];
  const sizes = [L, W, L, W];
  for (let i = 0; i < 4; i++) {
    out.push({
      id: `dim-panel-${i}`,
      kind: "linear",
      p1: vec(o.x + xs[i]!, cb.max.y),
      p2: vec(o.x + xs[i + 1]!, cb.max.y),
      offset: row1,
      text: `${names[i]} ${fmt(sizes[i]!)}`,
    });
  }
  out.push({
    id: "dim-sheet-width",
    kind: "linear",
    p1: vec(cb.min.x, cb.max.y),
    p2: vec(cb.max.x, cb.max.y),
    offset: row2,
    text: `Sheet ${fmt(cb.max.x - cb.min.x)}`,
  });
  out.push({
    id: "dim-height",
    kind: "linear",
    p1: vec(o.x, o.y),
    p2: vec(o.x, o.y + H),
    offset: p.glueFlapWidth + p.bleed + 6,
    text: `Height ${fmt(H)}`,
  });
  out.push({
    id: "dim-sheet-height",
    kind: "linear",
    p1: vec(cb.max.x, cb.min.y),
    p2: vec(cb.max.x, cb.max.y),
    offset: -(p.bleed + 6),
    text: `Sheet ${fmt(cb.max.y - cb.min.y)}`,
  });
  return out;
}
