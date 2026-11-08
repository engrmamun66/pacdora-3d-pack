import { z } from "zod";
import { type CartonBaseParams, type Issue, cartonBaseShape, parseOrThrow, resolveCartonBase, ParamValidationError } from "./carton-common";

/** What a user (or the AI layer) is allowed to provide. Optional fields get documented defaults. */
export const tuckEndInputSchema = z.object({
  variant: z.enum(["straight", "reverse"]).default("straight"),
  ...cartonBaseShape,
});

export type TuckEndInput = z.input<typeof tuckEndInputSchema>;

export interface TuckEndParams extends CartonBaseParams {
  readonly variant: "straight" | "reverse";
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
  const d = parseOrThrow(tuckEndInputSchema, input);
  const used: string[] = [];
  const issues: Issue[] = [];
  const base = resolveCartonBase(d, used, issues);
  if (issues.length > 0) throw new ParamValidationError(issues);
  return { params: { variant: d.variant, ...base }, unverifiedDefaultsUsed: used };
}
