import { z } from "zod";
import { type CartonBaseParams, type Issue, cartonBaseShape, effectiveDims, parseOrThrow, resolveCartonBase, ParamValidationError } from "./carton-common";

/**
 * Crash-lock (auto) bottom carton: tuck-end top, pre-glued bottom that sets
 * itself when the flat carton is opened. Top inputs are shared with the tuck
 * end carton.
 */
export const crashLockInputSchema = z.object({
  ...cartonBaseShape,
  /** How much the free end of each side (lock) flap is cut back, so it clears the next panel while folding. */
  lockFlapTaper: z.number().finite().min(0).max(100).optional(),
});

export type CrashLockInput = z.input<typeof crashLockInputSchema>;

export interface CrashLockParams extends CartonBaseParams {
  readonly lockFlapTaper: number;
}

export interface ResolvedCrashLock {
  readonly params: CrashLockParams;
  /** Parameters filled from unverified built-in defaults (see docs/dieline-math.md). */
  readonly unverifiedDefaultsUsed: readonly string[];
}

export function resolveCrashLockParams(input: unknown): ResolvedCrashLock {
  const d = parseOrThrow(crashLockInputSchema, input);
  const used: string[] = [];
  const issues: Issue[] = [];
  const base = resolveCartonBase(d, used, issues);
  const { L, W } = effectiveDims(base);

  let lockFlapTaper = d.lockFlapTaper;
  if (lockFlapTaper === undefined) {
    used.push("lockFlapTaper");
    lockFlapTaper = Math.min(3, W * 0.1); // UNVERIFIED default
  }

  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) issues.push({ path, message });
  };
  // The two side (lock) flaps are each depth/2 deep and meet from opposite sides.
  need(W <= L, "depth", "must not exceed the width for a crash-lock bottom (the side flaps would overlap)");
  // A smaller non-zero taper would vanish on the 0.1 micrometre geometry grid.
  need(lockFlapTaper === 0 || lockFlapTaper >= 0.01, "lockFlapTaper", "must be 0 or at least 0.01 mm");
  need(lockFlapTaper <= W / 2, "lockFlapTaper", "must be at most half the depth (the flap must still cover the glue tab)");
  need(2 * base.safeMargin < W / 2, "safeMargin", "twice the safe margin must be smaller than half the depth (bottom flaps)");
  if (issues.length > 0) throw new ParamValidationError(issues);

  return { params: { ...base, lockFlapTaper }, unverifiedDefaultsUsed: used };
}
