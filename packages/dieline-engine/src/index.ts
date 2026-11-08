export * from "./primitives/vec2";
export * from "./primitives/polygon";
export * from "./fold-tree/types";
export * from "./fold-tree/extract";
export * from "./fold-tree/fold3d";
export * from "./geometry-types";
export * from "./templates/tuck-end-params";
export * from "./templates/tuck-end-carton";

import { type DielineGeometry } from "./geometry-types";
import { generateTuckEndCarton, TUCK_END_TEMPLATE_ID } from "./templates/tuck-end-carton";

const generators: Record<string, (input: unknown) => DielineGeometry> = {
  [TUCK_END_TEMPLATE_ID]: generateTuckEndCarton,
};

/** Generate a validated dieline for a registered template id. */
export function generateDieline(templateId: string, input: unknown): DielineGeometry {
  const gen = generators[templateId];
  if (!gen) throw new Error(`Unknown template "${templateId}". Known: ${Object.keys(generators).join(", ")}`);
  return gen(input);
}
