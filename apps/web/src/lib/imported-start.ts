import { CONSTRUCTION_DEFAULTS, type FlatDieline, type FoldSetup, importedDefaults, importedPlan, resolveConstruction } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";

/** Starting parameters of an imported template: its size and bleed, plus the board and size mode the admin chose. */
export function importedStartParams(flat: FlatDielineData, fold?: FoldSetup | null) {
  const plan = importedPlan(fold);
  const cons = plan ? resolveConstruction(fold?.construction, plan) : null;
  // The board is offered on every imported template: the suggested 0.5 mm unless the admin chose one. Size mode only with box settings.
  return { ...importedDefaults(flat as FlatDieline), thickness: cons?.thickness ?? fold?.construction?.thickness ?? CONSTRUCTION_DEFAULTS.thickness, ...(cons ? { sizeMode: cons.sizeMode } : {}) };
}
