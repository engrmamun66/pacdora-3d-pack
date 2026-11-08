import { z } from "zod";
import { type Vec2, vec } from "../primitives/vec2";

/** Raised when user input is out of range or physically inconsistent. */
export class ParamValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Invalid packaging parameters: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "ParamValidationError";
  }
}

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);

/** What a user (or the AI layer) is allowed to provide. Optional fields get documented defaults. */
export const tuckEndInputSchema = z.object({
  variant: z.enum(["straight", "reverse"]).default("straight"),
  /** Width of the front/back panels (x direction), mm. */
  width: mm(10, 1000),
  /** Depth of the side panels, mm. */
  depth: mm(10, 1000),
  /** Height of the carton body, mm. */
  height: mm(10, 1000),
  /** Board thickness, mm. */
  thickness: mm(0.05, 5).default(0.5),
  /**
   * Allowance added to width, depth and height = allowanceFactor * thickness.
   * Default 0: no thickness compensation until a rule is chosen with the printer.
   */
  allowanceFactor: mm(0, 5).default(0),
  bleed: mm(0, 20).default(3),
  safeMargin: mm(0, 20).default(3),
  glueFlapWidth: mm(2, 100).optional(),
  glueFlapBevel: mm(0, 50).optional(),
  tuckDepth: mm(2, 500).optional(),
  tuckCornerCut: mm(0, 50).optional(),
  dustFlapDepth: mm(2, 500).optional(),
  dustFlapInset: mm(0, 100).optional(),
});

export type TuckEndInput = z.input<typeof tuckEndInputSchema>;

export interface TuckEndParams {
  readonly variant: "straight" | "reverse";
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly thickness: number;
  readonly allowanceFactor: number;
  readonly bleed: number;
  readonly safeMargin: number;
  readonly glueFlapWidth: number;
  readonly glueFlapBevel: number;
  readonly tuckDepth: number;
  readonly tuckCornerCut: number;
  readonly dustFlapDepth: number;
  readonly dustFlapInset: number;
}

export interface ResolvedTuckEnd {
  readonly params: TuckEndParams;
  /**
   * Parameters the user did not set and that were filled from the built-in
   * defaults. THESE DEFAULTS ARE NOT VALIDATED AGAINST AN INDUSTRY STANDARD:
   * confirm with your printer before production use (see docs/dieline-math.md).
   */
  readonly unverifiedDefaultsUsed: readonly string[];
}

/** Validate input, fill documented defaults, and check geometric consistency. */
export function resolveTuckEndParams(input: unknown): ResolvedTuckEnd {
  const parsed = tuckEndInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ParamValidationError(
      parsed.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  const d = parsed.data;
  const used: string[] = [];
  const pick = (name: string, given: number | undefined, fallback: () => number): number => {
    if (given !== undefined) return given;
    used.push(name);
    return fallback();
  };

  const w = d.width + d.allowanceFactor * d.thickness;
  const dp = d.depth + d.allowanceFactor * d.thickness;

  // UNVERIFIED defaults (documented in docs/dieline-math.md).
  const glueFlapWidth = pick("glueFlapWidth", d.glueFlapWidth, () => Math.min(15, dp));
  const glueFlapBevel = pick("glueFlapBevel", d.glueFlapBevel, () => Math.min(3, glueFlapWidth * 0.4));
  const tuckDepth = pick("tuckDepth", d.tuckDepth, () => Math.min(dp * 0.6, 25));
  const tuckCornerCut = pick("tuckCornerCut", d.tuckCornerCut, () => Math.min(4, tuckDepth / 3));
  const dustFlapDepth = pick("dustFlapDepth", d.dustFlapDepth, () => Math.min(dp * 0.5, w * 0.4));
  const dustFlapInset = pick("dustFlapInset", d.dustFlapInset, () => Math.min(3, dp * 0.1));

  const params: TuckEndParams = {
    variant: d.variant,
    width: d.width,
    depth: d.depth,
    height: d.height,
    thickness: d.thickness,
    allowanceFactor: d.allowanceFactor,
    bleed: d.bleed,
    safeMargin: d.safeMargin,
    glueFlapWidth,
    glueFlapBevel,
    tuckDepth,
    tuckCornerCut,
    dustFlapDepth,
    dustFlapInset,
  };

  const h = d.height + d.allowanceFactor * d.thickness;
  const issues: { path: string; message: string }[] = [];
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
  need(
    2 * d.safeMargin < Math.min(w, dp, h, tuckDepth),
    "safeMargin",
    "twice the safe margin must be smaller than every printable panel dimension",
  );
  if (issues.length > 0) throw new ParamValidationError(issues);

  return { params, unverifiedDefaultsUsed: used };
}

/** Effective (allowance-adjusted) dimensions used by geometry and checks. */
export function effectiveDims(p: TuckEndParams) {
  const k = p.allowanceFactor * p.thickness;
  return { L: p.width + k, W: p.depth + k, H: p.height + k };
}

/** Offset of the carton body origin inside the sheet (room for flaps and bleed). */
export function sheetOrigin(p: TuckEndParams): Vec2 {
  const { W } = effectiveDims(p);
  return vec(p.glueFlapWidth + p.bleed, Math.max(W + p.tuckDepth, p.dustFlapDepth) + p.bleed);
}
