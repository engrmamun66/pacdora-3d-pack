import { type Vec2, vec, nearlyEqual } from "../primitives/vec2";
import { area, bounds, offsetPolygon } from "../primitives/polygon";
import type { FoldTree, Hinge, LinearAnnotation, Panel, PanelRole } from "../fold-tree/types";
import { DielineBuildError, extractLines } from "../fold-tree/extract";
import { type DielineGeometry, DielineValidationError, type SafeArea } from "../geometry-types";
import { runChecks } from "../validate/checks";
import { ParamValidationError, effectiveDims, resolveTuckEndParams, sheetOrigin, type TuckEndParams } from "./tuck-end-params";

export const TUCK_END_TEMPLATE_ID = "tuck-end-carton";
export const ENGINE_VERSION = "0.1.0";

/** Remove consecutive duplicate points (e.g. zero corner cut). */
function poly(...pts: Vec2[]): Vec2[] {
  return pts.filter((p, i) => !nearlyEqual(p, pts[(i + 1) % pts.length]!));
}

/**
 * Build the fold tree of a tuck-end carton.
 *
 * Layout (x direction): [glue flap][front L][right W][back L][left W], each
 * body panel H tall. Top closure + tuck hang from the back panel; the bottom
 * closure + tuck hang from the back (straight) or front (reverse) panel.
 * Dust flaps hang from both side panels, top and bottom.
 */
export function buildTuckEndTree(p: TuckEndParams): FoldTree {
  const { L, W, H } = effectiveDims(p);
  const { glueFlapWidth: g, glueFlapBevel: gb, tuckDepth: t, tuckCornerCut: c, dustFlapDepth: d, dustFlapInset: s } = p;
  const o = sheetOrigin(p);
  const P = (x: number, y: number): Vec2 => vec(x + o.x, y + o.y);

  const panels: Panel[] = [];
  const hinges: Hinge[] = [];
  const addPanel = (id: string, role: PanelRole, label: string, polygon: Vec2[], printable: boolean) =>
    panels.push({ id, role, label, polygon, printable });
  const addHinge = (child: string, parent: string, a: Vec2, b: Vec2) =>
    hinges.push({ id: `h-${child}`, parentId: parent, childId: child, a, b, foldAngleDeg: 90 });

  // Body panels.
  const bodyX = { front: 0, right: L, back: L + W, left: 2 * L + W } as const;
  const bodyW = { front: L, right: W, back: L, left: W } as const;
  type Body = keyof typeof bodyX;
  const bodyIds: Body[] = ["front", "right", "back", "left"];
  for (const id of bodyIds) {
    const x = bodyX[id];
    const w = bodyW[id];
    addPanel(id, "body", id, poly(P(x, 0), P(x + w, 0), P(x + w, H), P(x, H)), true);
  }
  addHinge("right", "front", P(L, 0), P(L, H));
  addHinge("back", "right", P(L + W, 0), P(L + W, H));
  addHinge("left", "back", P(2 * L + W, 0), P(2 * L + W, H));

  // Glue flap on the free left edge of the front panel.
  addPanel("glue", "glue-flap", "glue flap", poly(P(0, 0), P(0, H), P(-g, H - gb), P(-g, gb)), false);
  addHinge("glue", "front", P(0, 0), P(0, H));

  // Closures (L wide, W deep) with tuck flaps (L wide, t deep, cut corners).
  const topHost: Body = "back";
  const bottomHost: Body = p.variant === "straight" ? "back" : "front";

  const xt = bodyX[topHost];
  addPanel("top-closure", "closure", "top closure", poly(P(xt, -W), P(xt + L, -W), P(xt + L, 0), P(xt, 0)), true);
  addHinge("top-closure", topHost, P(xt, 0), P(xt + L, 0));
  addPanel(
    "top-tuck",
    "tuck",
    "top tuck",
    poly(P(xt, -W), P(xt + L, -W), P(xt + L, -W - t + c), P(xt + L - c, -W - t), P(xt + c, -W - t), P(xt, -W - t + c)),
    true,
  );
  addHinge("top-tuck", "top-closure", P(xt, -W), P(xt + L, -W));

  const xb = bodyX[bottomHost];
  addPanel("bottom-closure", "closure", "bottom closure", poly(P(xb, H), P(xb + L, H), P(xb + L, H + W), P(xb, H + W)), true);
  addHinge("bottom-closure", bottomHost, P(xb, H), P(xb + L, H));
  addPanel(
    "bottom-tuck",
    "tuck",
    "bottom tuck",
    poly(
      P(xb, H + W),
      P(xb + L, H + W),
      P(xb + L, H + W + t - c),
      P(xb + L - c, H + W + t),
      P(xb + c, H + W + t),
      P(xb, H + W + t - c),
    ),
    true,
  );
  addHinge("bottom-tuck", "bottom-closure", P(xb, H + W), P(xb + L, H + W));

  // Dust flaps (W wide at the hinge, d deep, free edge inset by s each side).
  for (const host of ["right", "left"] as const) {
    const x = bodyX[host];
    addPanel(`dust-${host}-top`, "dust-flap", `dust ${host} top`, poly(P(x, 0), P(x + W, 0), P(x + W - s, -d), P(x + s, -d)), false);
    addHinge(`dust-${host}-top`, host, P(x, 0), P(x + W, 0));
    addPanel(`dust-${host}-bottom`, "dust-flap", `dust ${host} bottom`, poly(P(x, H), P(x + W, H), P(x + W - s, H + d), P(x + s, H + d)), false);
    addHinge(`dust-${host}-bottom`, host, P(x, H), P(x + W, H));
  }

  return { rootId: "front", panels, hinges };
}

const fmt = (n: number): string => n.toFixed(2);

/** Validate params, build the flat dieline, run all checks. Never returns invalid geometry. */
export function generateTuckEndCarton(input: unknown): DielineGeometry {
  const { params, unverifiedDefaultsUsed } = resolveTuckEndParams(input);
  const tree = buildTuckEndTree(params);
  const lines = extractLines(tree);
  const outer = lines.cutLoops[0];
  if (!outer) throw new DielineBuildError("No cut outline produced.");

  let bleedLoop: readonly Vec2[] = outer;
  let bleedPieces = 1;
  if (params.bleed > 0) {
    const pieces = offsetPolygon(outer, params.bleed);
    bleedPieces = pieces.length;
    const largest = [...pieces].sort((a, b) => area(b) - area(a))[0];
    if (!largest) throw new DielineBuildError("Bleed offset produced no outline.");
    bleedLoop = largest;
  }

  const safeAreas: SafeArea[] = [];
  for (const panel of tree.panels) {
    if (!panel.printable) continue;
    if (params.safeMargin === 0) {
      safeAreas.push({ panelId: panel.id, polygon: panel.polygon });
      continue;
    }
    const inset = offsetPolygon(panel.polygon, -params.safeMargin);
    if (inset.length !== 1) {
      throw new ParamValidationError([
        { path: "safeMargin", message: `too large for panel "${panel.id}" (its safe area would vanish or split)` },
      ]);
    }
    safeAreas.push({ panelId: panel.id, polygon: inset[0]! });
  }

  const cutBounds = bounds(outer);
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
