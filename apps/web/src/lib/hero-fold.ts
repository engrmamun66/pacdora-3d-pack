/**
 * Staged fold for the hero box. One number t drives the whole carton:
 *   t = 0    flat sheet
 *   t = 0.5  body built (walls up), lid, tuck and dust flaps still open
 *   t = 1    closed
 * Closing builds the body first, then folds the dust flaps, the lid and the tuck last;
 * opening plays it backwards, so the lid visibly opens before the body unfolds.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export interface HingeInfo {
  readonly id: string;
  /** Role of the panel the hinge turns (body, glue-flap, closure, tuck, dust-flap, ...). */
  readonly childRole: string;
}

/** Fold progress (0..1) for one hinge at stage t. */
export function hingeProgressAt(childRole: string, t: number): number {
  switch (childRole) {
    case "dust-flap":
    case "lock-flap":
      return ease(clamp01((t - 0.5) / 0.2));
    case "closure":
    case "flap":
      return ease(clamp01((t - 0.6) / 0.25));
    case "tuck":
      return ease(clamp01((t - 0.8) / 0.2));
    default: // body walls and glue flap
      return ease(clamp01(t / 0.5));
  }
}

export function stagedHinges(hinges: readonly HingeInfo[], t: number): Record<string, number> {
  return Object.fromEntries(hinges.map((h) => [h.id, hingeProgressAt(h.childRole, t)]));
}

/** Seconds per loop and the time at which each starting position begins. */
export const CYCLE_SECONDS = 14;
export const START_OFFSET = { closed: 0, "lid-open": 4, flat: 8 } as const;
/** Never exactly flat: coplanar faces flicker. */
const FLAT_T = 0.04;

/** Stage t over time: hold closed, open lid, hold, unfold, hold flat, fold body, close lid. */
export function stageAt(seconds: number): number {
  const s = ((seconds % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;
  const seg = (from: number, to: number) => ease(clamp01((s - from) / (to - from)));
  if (s < 1.5) return 1;
  if (s < 4) return 1 - 0.5 * seg(1.5, 4);
  if (s < 5.5) return 0.5;
  if (s < 8) return 0.5 - (0.5 - FLAT_T) * seg(5.5, 8);
  if (s < 9.5) return FLAT_T;
  if (s < 12) return FLAT_T + (0.5 - FLAT_T) * seg(9.5, 12);
  return 0.5 + 0.5 * seg(12, 14);
}

/** The still pose for a starting position (also used when animation is off). */
export const STILL_STAGE = { closed: 1, "lid-open": 0.5, flat: FLAT_T } as const;
