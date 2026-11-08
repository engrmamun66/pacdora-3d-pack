import { z } from "zod";
import type { FoldTree } from "../fold-tree/types";
import type { CheckResult, DielineGeometry } from "../geometry-types";
import { flatPoint, transformPoint } from "../fold-tree/fold3d";
import { intersectionArea, unionArea } from "../primitives/polygon";
import { type Vec2, vec } from "../primitives/vec2";
import {
  type Body,
  type Issue,
  type TubeLayout,
  ParamValidationError,
  TubeBuilder,
  finalizeCarton,
  parseOrThrow,
  poly,
  tubeBaseExpectations,
} from "./carton-common";

/**
 * Regular slotted container (FEFCO 0201), our own implementation of the public
 * standard structure: four body panels, a glued manufacturer's joint, and four
 * flaps at each end, all W/2 deep. The major flaps (on the width panels) meet
 * at the centre line; the minor flaps (on the depth panels) fold underneath.
 * Adjacent flaps are separated by slots centred on the body creases.
 */
export const SLOTTED_BOX_TEMPLATE_ID = "slotted-box";

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);

export const slottedBoxInputSchema = z.object({
  /** Length of the major (width) panels, mm. */
  width: mm(10, 2000),
  /** Length of the minor (depth) panels, mm. */
  depth: mm(10, 2000),
  height: mm(10, 2000),
  /** Corrugated board thickness, mm. */
  thickness: mm(0.5, 15).default(3),
  sizeMode: z.enum(["manufacture", "inner"]).default("manufacture"),
  allowanceFactor: mm(0, 5).optional(),
  bleed: mm(0, 20).default(3),
  safeMargin: mm(0, 50).default(5),
  /** Manufacturer's joint (glue flap) width. */
  glueFlapWidth: mm(5, 100).optional(),
  glueFlapBevel: mm(0, 50).optional(),
  /** Width of the slot between adjacent flaps, centred on the body crease. 0 = plain cut. */
  slotWidth: mm(0, 30).optional(),
});

export type SlottedBoxInput = z.input<typeof slottedBoxInputSchema>;

export interface SlottedBoxParams {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly thickness: number;
  readonly sizeMode: "manufacture" | "inner";
  readonly allowanceFactor: number;
  readonly bleed: number;
  readonly safeMargin: number;
  readonly glueFlapWidth: number;
  readonly glueFlapBevel: number;
  readonly slotWidth: number;
}

export function resolveSlottedBoxParams(input: unknown): { params: SlottedBoxParams; unverifiedDefaultsUsed: string[] } {
  const d = parseOrThrow(slottedBoxInputSchema, input);
  const used: string[] = [];
  const pick = (name: string, given: number | undefined, fallback: () => number): number => {
    if (given !== undefined) return given;
    used.push(name);
    return fallback();
  };
  const allowanceFactor = d.sizeMode === "inner" ? pick("allowanceFactor", d.allowanceFactor, () => 1) : 0;
  const k = allowanceFactor * d.thickness;
  const L = d.width + k;
  const W = d.depth + k;
  const H = d.height + k;

  // UNVERIFIED defaults (documented in docs/dieline-math.md).
  const glueFlapWidth = pick("glueFlapWidth", d.glueFlapWidth, () => Math.min(30, W));
  const glueFlapBevel = pick("glueFlapBevel", d.glueFlapBevel, () => Math.min(5, glueFlapWidth * 0.4, H * 0.1));
  const slotWidth = pick("slotWidth", d.slotWidth, () => Math.min(2 * d.thickness, W / 4));

  const issues: Issue[] = [];
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) issues.push({ path, message });
  };
  need(d.bleed === 0 || d.bleed >= 0.01, "bleed", "must be 0 or at least 0.01 mm");
  need(d.safeMargin === 0 || d.safeMargin >= 0.01, "safeMargin", "must be 0 or at least 0.01 mm");
  need(slotWidth === 0 || slotWidth >= 0.01, "slotWidth", "must be 0 or at least 0.01 mm");
  need(d.sizeMode === "inner" || d.allowanceFactor === undefined, "allowanceFactor", 'only applies when sizeMode is "inner"');
  need(W <= L, "depth", "must not exceed the width (the minor flaps, each depth/2 deep, would overlap)");
  need(slotWidth < W / 2, "slotWidth", "must be less than half the depth (flaps must keep a usable width)");
  need(glueFlapWidth <= W, "glueFlapWidth", "must not exceed the depth (it is glued onto a side panel)");
  need(glueFlapBevel < glueFlapWidth, "glueFlapBevel", "must be smaller than glueFlapWidth");
  need(2 * glueFlapBevel < H, "glueFlapBevel", "must be less than half the height");
  need(2 * d.safeMargin < Math.min(W / 2, H), "safeMargin", "twice the safe margin must be smaller than half the depth and the height");
  if (issues.length > 0) throw new ParamValidationError(issues);

  return {
    params: {
      width: d.width,
      depth: d.depth,
      height: d.height,
      thickness: d.thickness,
      sizeMode: d.sizeMode,
      allowanceFactor,
      bleed: d.bleed,
      safeMargin: d.safeMargin,
      glueFlapWidth,
      glueFlapBevel,
      slotWidth,
    },
    unverifiedDefaultsUsed: used,
  };
}

export function slottedBoxLayout(p: SlottedBoxParams): TubeLayout {
  const k = p.allowanceFactor * p.thickness;
  const W = p.depth + k;
  return {
    L: p.width + k,
    W,
    H: p.height + k,
    origin: vec(p.glueFlapWidth + p.bleed, W / 2 + p.bleed),
    glueFlapWidth: p.glueFlapWidth,
    glueFlapBevel: p.glueFlapBevel,
  };
}

const BODIES: readonly Body[] = ["front", "right", "back", "left"];
const MAJOR = new Set<Body>(["front", "back"]);
const flapId = (end: "top" | "bottom", body: Body) => `${end}-${body}`;

export function buildSlottedBoxTree(p: SlottedBoxParams): FoldTree {
  const b = new TubeBuilder(slottedBoxLayout(p));
  const e = p.slotWidth / 2; // each flap is set in by half a slot at both ends
  b.addBodyAndGlueStrip(e);
  const { P, W, H } = b;
  const f = W / 2;
  for (const [end, y0, dir] of [["top", 0, -1], ["bottom", H, 1]] as const) {
    for (const body of BODIES) {
      const x = b.bodyX[body];
      const w = b.bodyW[body];
      const id = flapId(end, body);
      const major = MAJOR.has(body);
      const a = P(x + e, y0);
      const c = P(x + w - e, y0);
      b.addPanel(id, major ? "closure" : "dust-flap", `${end} ${major ? "major" : "minor"} ${body}`, { polygon: poly(a, c, P(x + w - e, y0 + dir * f), P(x + e, y0 + dir * f)) }, major);
      b.addHinge(id, body, a, c);
    }
    if (e === 0) {
      // Without a slot, neighbouring flaps touch: separate them by a cut.
      for (const body of ["right", "back", "left"] as const) {
        const x = b.bodyX[body];
        b.slits.push({ id: `slit-${end}-${body}`, a: P(x, y0), b: P(x, y0 + dir * f) });
      }
    }
  }
  return b.tree();
}

export function generateSlottedBox(input: unknown): DielineGeometry {
  const { params, unverifiedDefaultsUsed } = resolveSlottedBoxParams(input);
  const layout = slottedBoxLayout(params);
  const { L, W, H, origin: o } = layout;
  const s = params.slotWidth;
  const tree = buildSlottedBoxTree(params);
  const lids = (["top", "bottom"] as const).flatMap((end) =>
    (["front", "back"] as const).map((body) => ({
      closureId: flapId(end, body),
      y: end === "top" ? o.y : o.y + H,
      z: W / 2, // major flaps meet at the centre line
      xMin: o.x + s / 2,
      xMax: o.x + L - s / 2,
    })),
  );
  const expect = tubeBaseExpectations(layout, {
    top: W / 2,
    bottom: W / 2,
    // Per end: two major hinges (L - s) and two minor hinges (W - s).
    endCrease: 2 * (2 * (L - s) + 2 * (W - s)),
    lids,
    outwardRoles: ["body", "closure"],
  });
  return finalizeCarton({
    templateId: SLOTTED_BOX_TEMPLATE_ID,
    params,
    layout,
    unverifiedDefaultsUsed,
    tree,
    expect,
    extraChecks: (world) => slottedBoxChecks(layout, s, tree, world),
  });
}

/** Closed-end checks; expected values from L, W and the slot width only. */
export function slottedBoxChecks(t: TubeLayout, s: number, tree: FoldTree, world: Map<string, readonly number[]>): CheckResult[] {
  const out: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });
  const { L, W, H, origin: o } = t;
  const tol = 1e-3 * (L + W);
  for (const [end, y] of [["top", o.y], ["bottom", o.y + H]] as const) {
    const F = new Map<Body, Vec2[]>();
    let worst = 0;
    for (const body of BODIES) {
      const id = flapId(end, body);
      const panel = tree.panels.find((x) => x.id === id);
      const m = world.get(id);
      if (!panel || !m) {
        check(`folded-${end}-flaps-present`, false, `missing ${id}`);
        return out;
      }
      const pts = panel.polygon.map((v) => transformPoint(m, flatPoint(v)));
      worst = Math.max(worst, ...pts.map((q) => Math.abs(q.y - y)));
      F.set(body, pts.map((q) => vec(q.x, q.z)));
    }
    check(`folded-${end}-flat`, worst <= 1e-6, `${end} flaps within ${worst.toExponential(2)} mm of the end plane`);
    const covered = unionArea([...F.values()]);
    const expected = L * W - s * s; // only the four slot corners (s/2 x s/2) stay open
    check(`folded-${end}-covered`, Math.abs(covered - expected) <= tol, `${end} covered ${covered.toFixed(3)} of expected ${expected.toFixed(3)} mm2`);
    const majors = intersectionArea(F.get("front")!, F.get("back")!);
    const minors = intersectionArea(F.get("right")!, F.get("left")!);
    check(`folded-${end}-no-overlap`, majors <= tol && minors <= tol, `major overlap ${majors.toFixed(4)}, minor overlap ${minors.toFixed(4)} mm2`);
  }
  return out;
}
