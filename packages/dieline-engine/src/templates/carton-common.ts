import { z } from "zod";
import { type Vec2, vec, nearlyEqual } from "../primitives/vec2";
import { area, bounds, offsetOutline, outlineBounds } from "../primitives/polygon";
import { flattenOutline, roundCorners } from "../primitives/arc";
import type { FoldTree, Hinge, LinearAnnotation, Panel, PanelRole, Slit } from "../fold-tree/types";
import { DielineBuildError, extractLines, panelOutline } from "../fold-tree/extract";
import { type CheckResult, type DielineGeometry, DielineValidationError, type SafeArea } from "../geometry-types";
import { type CartonExpectations, runChecks } from "../validate/checks";

/**
 * Building blocks shared by the "tube" cartons (four body panels in a row plus
 * a side-seam glue strip): tuck end, crash-lock bottom, ...
 */

export const ENGINE_VERSION = "0.3.0";

/** Raised when user input is out of range or physically inconsistent. */
export class ParamValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Invalid packaging parameters: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ParamValidationError";
  }
}

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);

/** Inputs every tube carton shares (body, side seam, top tuck closure, top dust flaps). */
export const cartonBaseShape = {
  /** Width of the front/back panels (x direction), mm. */
  width: mm(10, 1000),
  /** Depth of the side panels, mm. */
  depth: mm(10, 1000),
  /** Height of the carton body, mm. */
  height: mm(10, 1000),
  /** Board thickness, mm. */
  thickness: mm(0.05, 5).default(0.5),
  /**
   * "manufacture": width/depth/height are crease-to-crease panel sizes (used as given).
   * "inner": they are the inside dimensions of the box; each gets an allowance of
   * allowanceFactor x thickness added to obtain the panel size.
   */
  sizeMode: z.enum(["manufacture", "inner"]).default("manufacture"),
  /** Only used when sizeMode = "inner". */
  allowanceFactor: mm(0, 5).optional(),
  /**
   * Width of the cut gap between a dust flap and the closure beside it, as a multiple of the
   * board thickness (the board needs that room to fold). 0 = the flap touches the closure.
   */
  cutGapFactor: mm(0, 5).optional(),
  bleed: mm(0, 20).default(3),
  safeMargin: mm(0, 20).default(3),
  glueFlapWidth: mm(2, 100).optional(),
  glueFlapBevel: mm(0, 50).optional(),
  tuckDepth: mm(2, 500).optional(),
  tuckCornerCut: mm(0, 50).optional(),
  /** Shape of the tuck flap's free corners: rounded (radius = tuckCornerCut) or straight chamfer. */
  tuckCornerStyle: z.enum(["round", "chamfer"]).default("round"),
  /** Cut slit at each end of the tuck crease (tuck lock). 0 = no slits. */
  tuckSlitLength: mm(0, 50).default(0),
  dustFlapDepth: mm(2, 500).optional(),
  dustFlapInset: mm(0, 100).optional(),
  /** Radius rounding the dust flap's free corners. */
  dustFlapCornerRadius: mm(0, 50).optional(),
} as const;

const cartonBaseSchema = z.object(cartonBaseShape);
type CartonBaseData = z.output<typeof cartonBaseSchema>;

export interface CartonBaseParams {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly thickness: number;
  readonly sizeMode: "manufacture" | "inner";
  /** Effective factor (0 in manufacture mode). */
  readonly allowanceFactor: number;
  /** Effective factor (default 1). */
  readonly cutGapFactor: number;
  /** Cut gap between a dust flap and its neighbouring closure, mm (= cutGapFactor x thickness). */
  readonly cutGap: number;
  readonly bleed: number;
  readonly safeMargin: number;
  readonly glueFlapWidth: number;
  readonly glueFlapBevel: number;
  readonly tuckDepth: number;
  readonly tuckCornerCut: number;
  readonly tuckCornerStyle: "round" | "chamfer";
  readonly tuckSlitLength: number;
  readonly dustFlapDepth: number;
  readonly dustFlapInset: number;
  readonly dustFlapCornerRadius: number;
}

export type Issue = { path: string; message: string };

/** Run a zod schema and convert failures into ParamValidationError. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ParamValidationError(
      parsed.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  return parsed.data;
}

/**
 * Fill documented defaults and check the shared geometric rules. Pushes the
 * names of defaulted parameters to `used` and rule failures to `issues`.
 */
export function resolveCartonBase(d: CartonBaseData, used: string[], issues: Issue[]): CartonBaseParams {
  const pick = (name: string, given: number | undefined, fallback: () => number): number => {
    if (given !== undefined) return given;
    used.push(name);
    return fallback();
  };

  const allowanceFactor = d.sizeMode === "inner" ? pick("allowanceFactor", d.allowanceFactor, () => 1) : 0;
  const w = d.width + allowanceFactor * d.thickness;
  const dp = d.depth + allowanceFactor * d.thickness;
  const h = d.height + allowanceFactor * d.thickness;
  const cutGapFactor = pick("cutGapFactor", d.cutGapFactor, () => 1);
  const cutGap = cutGapFactor * d.thickness;

  // UNVERIFIED defaults (documented in docs/dieline-math.md).
  const glueFlapWidth = pick("glueFlapWidth", d.glueFlapWidth, () => Math.min(15, dp));
  const glueFlapBevel = pick("glueFlapBevel", d.glueFlapBevel, () => Math.min(3, glueFlapWidth * 0.4));
  // Also kept below the height: the closed tuck hangs inside the body.
  const tuckDepth = pick("tuckDepth", d.tuckDepth, () => Math.min(dp * 0.6, 25, h * 0.9));
  const tuckCornerCut = pick("tuckCornerCut", d.tuckCornerCut, () => Math.min(4, tuckDepth / 3));
  const dustFlapDepth = pick("dustFlapDepth", d.dustFlapDepth, () => Math.min(dp * 0.5, w * 0.4));
  const dustFlapInset = pick("dustFlapInset", d.dustFlapInset, () => Math.min(3, dp * 0.1));
  const dustFlapCornerRadius = pick("dustFlapCornerRadius", d.dustFlapCornerRadius, () =>
    Math.min(3, dustFlapDepth / 4, (dp - 2 * dustFlapInset) / 4),
  );

  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) issues.push({ path, message });
  };
  // Below 0.01 mm the offset would round away on the 0.1 micrometre geometry grid.
  need(d.bleed === 0 || d.bleed >= 0.01, "bleed", "must be 0 or at least 0.01 mm");
  need(d.safeMargin === 0 || d.safeMargin >= 0.01, "safeMargin", "must be 0 or at least 0.01 mm");
  need(glueFlapWidth <= dp, "glueFlapWidth", "must not exceed the depth (it is glued onto a side panel)");
  need(glueFlapBevel < glueFlapWidth, "glueFlapBevel", "must be smaller than glueFlapWidth");
  need(2 * glueFlapBevel < h, "glueFlapBevel", "must be less than half the height");
  need(tuckDepth <= dp, "tuckDepth", "must not exceed the depth (tuck flap must fit inside the opening)");
  need(tuckDepth < h, "tuckDepth", "must be shorter than the height (the closed tuck flap hangs down inside the box)");
  need(tuckCornerCut < tuckDepth, "tuckCornerCut", "must be smaller than tuckDepth");
  need(2 * tuckCornerCut < w, "tuckCornerCut", "must be less than half the width");
  need(2 * dustFlapDepth < w, "dustFlapDepth", "must be less than half the width (opposite dust flaps would collide)");
  need(2 * dustFlapInset < dp, "dustFlapInset", "must be less than half the depth");
  need(cutGap <= dp / 4, "cutGapFactor", "the cut gap (factor x thickness) must not exceed a quarter of the depth");
  need(d.sizeMode === "inner" || d.allowanceFactor === undefined, "allowanceFactor", 'only applies when sizeMode is "inner"');
  need(2 * d.tuckSlitLength < w - 2 * tuckCornerCut, "tuckSlitLength", "slits at both ends must leave a crease between the tuck corners");
  need(
    2 * d.safeMargin < Math.min(w, dp, h, tuckDepth),
    "safeMargin",
    "twice the safe margin must be smaller than every printable panel dimension",
  );

  return {
    width: d.width,
    depth: d.depth,
    height: d.height,
    thickness: d.thickness,
    sizeMode: d.sizeMode,
    allowanceFactor,
    cutGapFactor,
    cutGap,
    bleed: d.bleed,
    safeMargin: d.safeMargin,
    glueFlapWidth,
    glueFlapBevel,
    tuckDepth,
    tuckCornerCut,
    tuckCornerStyle: d.tuckCornerStyle,
    tuckSlitLength: d.tuckSlitLength,
    dustFlapDepth,
    dustFlapInset,
    dustFlapCornerRadius,
  };
}

/** Effective (allowance-adjusted) dimensions used by geometry and checks. */
export function effectiveDims(p: CartonBaseParams) {
  const k = p.allowanceFactor * p.thickness;
  return { L: p.width + k, W: p.depth + k, H: p.height + k };
}

/** Offset of the carton body origin inside the sheet (room for top flaps and bleed). */
export function sheetOrigin(p: CartonBaseParams): Vec2 {
  return vec(p.glueFlapWidth + p.bleed, topExtent(p) + p.bleed);
}

/** How far the top closure + tuck / dust flaps reach above the body. */
export function topExtent(p: CartonBaseParams): number {
  const { W } = effectiveDims(p);
  return Math.max(W + p.tuckDepth, p.dustFlapDepth);
}

/**
 * Geometry every tube (four body panels in a row + side-seam glue strip)
 * shares, independent of how the ends are closed.
 */
export interface TubeLayout {
  readonly L: number;
  readonly W: number;
  readonly H: number;
  /** Sheet position of the front panel's top-left corner. */
  readonly origin: Vec2;
  readonly glueFlapWidth: number;
  readonly glueFlapBevel: number;
}

export function cartonLayout(p: CartonBaseParams): TubeLayout {
  return { ...effectiveDims(p), origin: sheetOrigin(p), glueFlapWidth: p.glueFlapWidth, glueFlapBevel: p.glueFlapBevel };
}

// ---------------------------------------------------------------------------
// Fold tree construction
// ---------------------------------------------------------------------------

export type Body = "front" | "right" | "back" | "left";
type Shape = { polygon: Vec2[]; bulges?: number[] };

/** Remove consecutive duplicate points (e.g. zero corner cut). */
export function poly(...pts: Vec2[]): Vec2[] {
  return pts.filter((p, i) => !nearlyEqual(p, pts[(i + 1) % pts.length]!));
}

/** Round the given corners; a radius that does not fit becomes a parameter error. */
export function rounded(param: string, points: Vec2[], radii: number[]): Shape {
  if (radii.every((r) => r <= 0)) return { polygon: points };
  try {
    const r = roundCorners(points, radii);
    return { polygon: r.points, bulges: r.bulges };
  } catch (e) {
    throw new ParamValidationError([{ path: param, message: (e as Error).message }]);
  }
}

/** Mutable fold tree under construction, in body-local coordinates (origin = top-left of the front panel). */
export class TubeBuilder {
  readonly panels: Panel[] = [];
  readonly hinges: Hinge[] = [];
  readonly slits: Slit[] = [];
  readonly L: number;
  readonly W: number;
  readonly H: number;
  /** x of each body panel's left edge (body-local). */
  readonly bodyX: Readonly<Record<Body, number>>;
  readonly bodyW: Readonly<Record<Body, number>>;

  constructor(readonly layout: TubeLayout) {
    const { L, W, H } = layout;
    this.L = L;
    this.W = W;
    this.H = H;
    this.bodyX = { front: 0, right: L, back: L + W, left: 2 * L + W };
    this.bodyW = { front: L, right: W, back: L, left: W };
  }

  /** Body-local point to sheet coordinates. */
  P = (x: number, y: number): Vec2 => vec(x + this.layout.origin.x, y + this.layout.origin.y);

  addPanel(id: string, role: PanelRole, label: string, shape: Shape, printable: boolean): void {
    this.panels.push({ id, role, label, polygon: shape.polygon, ...(shape.bulges ? { bulges: shape.bulges } : {}), printable });
  }

  addHinge(child: string, parent: string, a: Vec2, b: Vec2, foldAngleDeg = 90): void {
    this.hinges.push({ id: `h-${child}`, parentId: parent, childId: child, a, b, foldAngleDeg });
  }

  /**
   * Layout (x direction): [glue flap][front L][right W][back L][left W], each
   * body panel H tall, glue strip on the free left edge of the front panel.
   * `edgeInset` > 0 adds vertices that far in from both ends of every top and
   * bottom body edge (hinge endpoints of flaps narrower than their panel).
   */
  addBodyAndGlueStrip(edgeInset = 0): void {
    const { P, L, W, H } = this;
    const { glueFlapWidth: g, glueFlapBevel: gb } = this.layout;
    const e = edgeInset;
    for (const id of ["front", "right", "back", "left"] as Body[]) {
      const x = this.bodyX[id];
      const w = this.bodyW[id];
      const top = e > 0 ? [P(x + e, 0), P(x + w - e, 0)] : [];
      const bottom = e > 0 ? [P(x + w - e, H), P(x + e, H)] : [];
      this.addPanel(id, "body", id, { polygon: poly(P(x, 0), ...top, P(x + w, 0), P(x + w, H), ...bottom, P(x, H)) }, true);
    }
    this.addHinge("right", "front", P(L, 0), P(L, H));
    this.addHinge("back", "right", P(L + W, 0), P(L + W, H));
    this.addHinge("left", "back", P(2 * L + W, 0), P(2 * L + W, H));
    this.addPanel("glue", "glue-flap", "glue flap", { polygon: poly(P(0, 0), P(0, H), P(-g, H - gb), P(-g, gb)) }, false);
    this.addHinge("glue", "front", P(0, 0), P(0, H));
  }

  tree(): FoldTree {
    return { rootId: "front", panels: this.panels, hinges: this.hinges, slits: this.slits };
  }
}

/**
 * Which ends of a dust flap on `host` are flat-adjacent to the closure on `closureHost`.
 * Body order in the flat is [front][right][back][left].
 */
export function dustGaps(host: "right" | "left", closureHost: Body): { left: boolean; right: boolean } {
  if (host === "right") return { left: closureHost === "front", right: closureHost === "back" };
  return { left: closureHost === "back", right: false };
}

/** Crease length lost to the cut gaps on the dust flap hinges of one end (top or bottom). */
export function dustHingeLoss(p: CartonBaseParams, closureHost: Body): number {
  const n = [dustGaps("right", closureHost), dustGaps("left", closureHost)].reduce((c, g) => c + (g.left ? 1 : 0) + (g.right ? 1 : 0), 0);
  return n * p.cutGap;
}

/** Tube carton with tuck closures and dust flaps (folding-carton board). */
export class CartonBuilder extends TubeBuilder {
  constructor(readonly p: CartonBaseParams) {
    super(cartonLayout(p));
  }

  /**
   * Closure (L x W) on a body edge at y = y0, plus its tuck flap (L x t).
   * dir = -1 grows upward (top), +1 downward (bottom). Optional tuck slits
   * shorten the tuck crease at both ends.
   */
  addTuckClosure(which: "top" | "bottom", host: Body, y0: number, dir: -1 | 1): void {
    const { P, L, W } = this;
    const { tuckDepth: t, tuckCornerCut: c, tuckSlitLength: sl } = this.p;
    const x = this.bodyX[host];
    const yf = y0 + dir * W; // far edge of the closure = tuck crease line
    const yt = yf + dir * t; // free edge of the tuck
    const crease = sl > 0 ? [P(x + L - sl, yf), P(x + sl, yf)] : [];
    this.addPanel(`${which}-closure`, "closure", `${which} closure`, { polygon: poly(P(x, y0), P(x + L, y0), P(x + L, yf), ...crease, P(x, yf)) }, true);
    this.addHinge(`${which}-closure`, host, P(x, y0), P(x + L, y0));

    const creaseT = sl > 0 ? [P(x + sl, yf), P(x + L - sl, yf)] : [];
    let tuck: Shape;
    if (this.p.tuckCornerStyle === "chamfer" || c === 0) {
      tuck = {
        polygon: poly(P(x, yf), ...creaseT, P(x + L, yf), P(x + L, yt - dir * c), P(x + L - c, yt), P(x + c, yt), P(x, yt - dir * c)),
      };
    } else {
      const base = [P(x, yf), ...creaseT, P(x + L, yf), P(x + L, yt), P(x, yt)];
      const radii = base.map((_, i) => (i >= base.length - 2 ? c : 0));
      tuck = rounded("tuckCornerCut", base, radii);
    }
    this.addPanel(`${which}-tuck`, "tuck", `${which} tuck`, tuck, true);
    this.addHinge(`${which}-tuck`, `${which}-closure`, P(x + sl, yf), P(x + L - sl, yf));
    if (sl > 0) {
      this.slits.push({ id: `slit-${which}-a`, a: P(x, yf), b: P(x + sl, yf) });
      this.slits.push({ id: `slit-${which}-b`, a: P(x + L - sl, yf), b: P(x + L, yf) });
    }
  }

  /**
   * Dust flaps on both side panels (W wide at the hinge, free edge inset, corners rounded).
   * Where a dust flap sits next to the closure on `closureHost` it stops `cutGap` short of it, so
   * a slot of that width (the board thickness times cutGapFactor) separates the two.
   */
  addDustFlaps(pos: "top" | "bottom", closureHost: Body): void {
    const { P, W, H } = this;
    const { dustFlapDepth: d, dustFlapInset: s, dustFlapCornerRadius: r, cutGap: g } = this.p;
    const [y0, dir] = pos === "top" ? [0, -1] : [H, 1];
    for (const host of ["right", "left"] as const) {
      const x = this.bodyX[host];
      const id = `dust-${host}-${pos}`;
      const gap = dustGaps(host, closureHost);
      const gl = gap.left ? g : 0;
      const gr = gap.right ? g : 0;
      const yd = y0 + dir * d;
      const base = [P(x + gl, y0), P(x + W - gr, y0), P(x + W - Math.max(s, gr), yd), P(x + Math.max(s, gl), yd)];
      this.addPanel(id, "dust-flap", `dust ${host} ${pos}`, rounded("dustFlapCornerRadius", base, [0, 0, r, r]), false);
      // The body edge now has the slot bottom as a separate cut segment: give it its own vertices.
      if (gl > 0) this.splitEdge(host, P(x + gl, y0));
      if (gr > 0) this.splitEdge(host, P(x + W - gr, y0));
      this.addHinge(id, host, P(x + gl, y0), P(x + W - gr, y0));
    }
  }

  /** Insert a vertex on the edge of a panel that the point lies on (no-op if it is already one). */
  splitEdge(panelId: string, pt: Vec2): void {
    const i = this.panels.findIndex((q) => q.id === panelId);
    const panel = this.panels[i]!;
    const poly0 = panel.polygon;
    for (let k = 0; k < poly0.length; k++) {
      const a = poly0[k]!;
      const b = poly0[(k + 1) % poly0.length]!;
      if (nearlyEqual(a, pt) || nearlyEqual(b, pt)) return;
      const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
      const dot = (pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y);
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (Math.abs(cross) <= 1e-6 * Math.sqrt(len2) && dot > 0 && dot < len2) {
        const polygon = [...poly0.slice(0, k + 1), pt, ...poly0.slice(k + 1)];
        this.panels[i] = { ...panel, polygon };
        return;
      }
    }
    throw new DielineBuildError(`Point lies on no edge of panel "${panelId}".`);
  }

}

// ---------------------------------------------------------------------------
// Expectations shared by tube cartons (closed-form, independent of the builder)
// ---------------------------------------------------------------------------

/**
 * Expected values for any tube: sheet size, crease total, closed box, side
 * seam. `endCrease` is the crease length of everything except the four body
 * creases (top + bottom closures), from the template's own formula.
 */
export function tubeBaseExpectations(
  t: TubeLayout,
  ends: { top: number; bottom: number; endCrease: number; lids: CartonExpectations["lids"]; outwardRoles: CartonExpectations["outwardRoles"] },
): CartonExpectations {
  const { L, W, H, origin: o } = t;
  return {
    sheetWidth: t.glueFlapWidth + 2 * L + 2 * W,
    sheetHeight: ends.top + H + ends.bottom,
    creaseLength: 4 * H + ends.endCrease,
    box: { min: { x: o.x, y: o.y, z: 0 }, max: { x: o.x + L, y: o.y + H, z: W } },
    seam: {
      panelId: "left",
      flatA: vec(o.x + 2 * L + 2 * W, o.y),
      flatB: vec(o.x + 2 * L + 2 * W, o.y + H),
      target: [
        { x: o.x, y: o.y, z: 0 },
        { x: o.x, y: o.y + H, z: 0 },
      ],
    },
    lids: ends.lids,
    outwardRoles: ends.outwardRoles,
  };
}

/** Tube carton with the shared tuck top; the template supplies the bottom. */
export function tubeExpectations(
  p: CartonBaseParams,
  bottom: { extent: number; crease: number; lids: CartonExpectations["lids"] },
): CartonExpectations {
  const t = cartonLayout(p);
  const { L, W } = t;
  // Top: closure + shortened tuck crease + 2 dust flaps.
  const topCrease = L + (L - 2 * p.tuckSlitLength) + 2 * W - dustHingeLoss(p, "back");
  return tubeBaseExpectations(t, {
    top: topExtent(p),
    bottom: bottom.extent,
    endCrease: topCrease + bottom.crease,
    lids: [{ closureId: "top-closure", y: t.origin.y, z: 0, xMin: t.origin.x, xMax: t.origin.x + L }, ...bottom.lids],
    outwardRoles: ["body", "closure", "bottom-flap"],
  });
}

// ---------------------------------------------------------------------------
// Finishing: bleed, safe areas, annotations, checks
// ---------------------------------------------------------------------------

const fmt = (n: number): string => n.toFixed(2);

export interface FinalizeInput {
  readonly templateId: string;
  /** Resolved parameters, stored in the output as given. */
  readonly params: { readonly bleed: number; readonly safeMargin: number };
  readonly layout: TubeLayout;
  readonly unverifiedDefaultsUsed: readonly string[];
  readonly tree: FoldTree;
  readonly expect: CartonExpectations;
  /** Template-specific checks on the closed carton (world transforms given). */
  readonly extraChecks?: (world: Map<string, readonly number[]>) => CheckResult[];
}

/** Bleed, safe areas, annotations and all checks. Never returns invalid geometry. */
export function finalizeCarton(input: FinalizeInput): DielineGeometry {
  const { params, tree } = input;
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
  const annotations = buildTubeAnnotations(input.layout, params.bleed, cutBounds);

  const checks = runChecks({
    tree,
    lines,
    bleed: params.bleed,
    bleedLoop,
    bleedPieces,
    cutBounds,
    bleedBounds,
    expect: input.expect,
    ...(input.extraChecks ? { extraChecks: input.extraChecks } : {}),
  });
  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) throw new DielineValidationError(failed);

  return {
    unit: "mm",
    templateId: input.templateId,
    engineVersion: ENGINE_VERSION,
    params,
    unverifiedDefaultsUsed: input.unverifiedDefaultsUsed,
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

function buildTubeAnnotations(t: TubeLayout, bleed: number, cb: { min: Vec2; max: Vec2 }): LinearAnnotation[] {
  const { L, W, H, origin: o } = t;
  const out: LinearAnnotation[] = [];
  const row1 = bleed + 6;
  const row2 = bleed + 14;
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
    offset: t.glueFlapWidth + bleed + 6,
    text: `Height ${fmt(H)}`,
  });
  out.push({
    id: "dim-sheet-height",
    kind: "linear",
    p1: vec(cb.max.x, cb.min.y),
    p2: vec(cb.max.x, cb.max.y),
    offset: -(bleed + 6),
    text: `Sheet ${fmt(cb.max.y - cb.min.y)}`,
  });
  return out;
}
