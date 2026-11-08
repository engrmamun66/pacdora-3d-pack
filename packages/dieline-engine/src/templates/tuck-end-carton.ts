import type { FoldTree } from "../fold-tree/types";
import type { DielineGeometry } from "../geometry-types";
import { CartonBuilder, effectiveDims, finalizeCarton, sheetOrigin, tubeExpectations } from "./carton-common";
import { resolveTuckEndParams, type TuckEndParams } from "./tuck-end-params";

export const TUCK_END_TEMPLATE_ID = "tuck-end-carton";

/**
 * Build the fold tree of a tuck-end carton.
 *
 * Top closure + tuck hang from the back panel; the bottom closure + tuck hang
 * from the back (straight) or front (reverse) panel. Dust flaps hang from both
 * side panels, top and bottom.
 */
export function buildTuckEndTree(p: TuckEndParams): FoldTree {
  const b = new CartonBuilder(p);
  b.addBodyAndGlueStrip();
  b.addTuckClosure("top", "back", 0, -1);
  b.addTuckClosure("bottom", p.variant === "straight" ? "back" : "front", b.H, 1);
  b.addDustFlaps("top");
  b.addDustFlaps("bottom");
  return b.tree();
}

/** Validate params, build the flat dieline, run all checks. Never returns invalid geometry. */
export function generateTuckEndCarton(input: unknown): DielineGeometry {
  const { params, unverifiedDefaultsUsed } = resolveTuckEndParams(input);
  const { L, W, H } = effectiveDims(params);
  const o = sheetOrigin(params);
  // Bottom mirrors the top: closure + tuck (or dust flaps) below the body.
  const bottomHost = params.variant === "straight" ? "back" : "front";
  const expect = tubeExpectations(params, {
    extent: Math.max(W + params.tuckDepth, params.dustFlapDepth),
    crease: L + (L - 2 * params.tuckSlitLength) + 2 * W,
    // A closure on the back panel (z = W) lands its far edge at the front (z = 0) and vice versa.
    lids: [{ closureId: "bottom-closure", y: o.y + H, z: bottomHost === "back" ? 0 : W, xMin: o.x, xMax: o.x + L }],
  });
  return finalizeCarton({
    templateId: TUCK_END_TEMPLATE_ID,
    params,
    unverifiedDefaultsUsed,
    tree: buildTuckEndTree(params),
    expect,
  });
}
