export * from "./primitives/vec2";
export * from "./primitives/polygon";
export * from "./primitives/arc";
export * from "./fold-tree/types";
export * from "./fold-tree/extract";
export * from "./fold-tree/fold3d";
export * from "./geometry-types";
export * from "./watermark";
export type { CartonExpectations } from "./validate/checks";
export * from "./templates/carton-common";
export * from "./templates/tuck-end-params";
export * from "./templates/tuck-end-carton";
export * from "./templates/crash-lock-params";
export * from "./templates/crash-lock-carton";
export * from "./templates/slotted-box";

export * from "./templates/registry";
export * from "./templates/imported";
export * from "./templates/imported-fold";
export { planResize, resizeRatios, sheetMap, stretchPlanOf, type PartPlan, type PartSizes, type ResizePlan, type SizeClass } from "./templates/imported-resize";
export {
  CONSTRUCTION_DEFAULTS,
  DIM_KEYS,
  DIM_NAMES,
  FACTOR_RANGE,
  FLAP_SIZE_KEYS,
  THICKNESS_RANGE,
  creaseSizesOf,
  fullPlan,
  importedPlan,
  predictNames,
  resolveConstruction,
  sizeOffset,
  sizeTargets,
  validateConstruction,
  type Construction,
  type DimKey,
  type DimName,
  type FlapKey,
  type ResolvedConstruction,
  type SizeMode,
} from "./templates/imported-construction";

import { type DielineGeometry } from "./geometry-types";
import { getGenerator } from "./templates/registry";

/** Generate a validated dieline for a registered generator id. */
export function generateDieline(templateId: string, input: unknown): DielineGeometry {
  let gen;
  try {
    gen = getGenerator(templateId);
  } catch {
    throw new Error(`Unknown template "${templateId}".`);
  }
  return gen.generate(input);
}
