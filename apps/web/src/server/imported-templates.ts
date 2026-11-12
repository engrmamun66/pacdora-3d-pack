import "server-only";
import { CONSTRUCTION_DEFAULTS, type FlatDieline, type FoldSetup, type GeneratorDefinition, IMPORTED_GENERATOR_ID, createImportedGenerator, getGenerator, importedDefaults, importedPlan, resolveConstruction } from "@packaging/dieline-engine";
import { type FlatDielineData, type ImportedDieline, type Role, toFlatDieline } from "@packaging/svg-import";
import { db } from "./db";

/** The shape the browser needs to rebuild an imported template's generator (plain JSON). */
export interface ImportedSource {
  templateId: string;
  name: string;
  flat: FlatDielineData;
  /** How it folds in 3D, or null for a flat-only dieline. */
  fold: FoldSetup | null;
  /** Camera the 3D preview starts with (admin-set), or null. */
  viewSettings: unknown;
}

const cache = new Map<string, { stamp: number; source: ImportedSource }>();

/**
 * An imported (SVG) template ready for use, or null if it does not exist or is
 * not an imported template. Works for hidden templates too: projects keep working
 * after a template is unpublished. Cached until the template is edited.
 */
export async function loadImportedSource(templateId: string): Promise<ImportedSource | null> {
  if (typeof templateId !== "string" || templateId.length > 80) return null;
  const head = await db.template.findUnique({ where: { id: templateId }, select: { source: true, updatedAt: true } });
  if (!head || head.source !== "svg") return null;
  const stamp = head.updatedAt.getTime();
  const hit = cache.get(templateId);
  if (hit && hit.stamp === stamp) return hit.source;

  const row = await db.template.findUnique({ where: { id: templateId }, select: { name: true, geometry: true, viewSettings: true } });
  const g = row?.geometry as unknown as { dieline?: ImportedDieline; roles?: Record<string, Role>; fold?: FoldSetup | null; referenceStyles?: string[] } | null | undefined;
  if (!row || !g?.dieline || !g.roles) return null;
  const source: ImportedSource = { templateId, name: row.name, flat: toFlatDieline(g.dieline, g.roles, g.referenceStyles ?? []), fold: g.fold ?? null, viewSettings: row.viewSettings };
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(templateId, { stamp, source });
  return source;
}

/** Generator definition for a project's template: built-in generators by id, imported ones from the database. */
export async function resolveGenerator(generatorId: string, presetId: string): Promise<GeneratorDefinition | null> {
  if (generatorId !== IMPORTED_GENERATOR_ID) {
    try {
      return getGenerator(generatorId);
    } catch {
      return null;
    }
  }
  const src = await loadImportedSource(presetId);
  if (!src) return null;
  try {
    return createImportedGenerator(src.templateId, src.flat as FlatDieline, src.fold);
  } catch {
    return null;
  }
}

/** Starting parameters of an imported template. */
/** Starting parameters of an imported template: its size and bleed, plus the board and size mode the admin chose. */
export function importedStartParams(flat: FlatDielineData, fold?: FoldSetup | null) {
  const plan = importedPlan(fold);
  const cons = plan ? resolveConstruction(fold?.construction, plan) : null;
  // The board is offered on every imported template: the suggested 0.5 mm unless the admin chose one. Size mode only with box settings.
  return { ...importedDefaults(flat as FlatDieline), thickness: cons?.thickness ?? fold?.construction?.thickness ?? CONSTRUCTION_DEFAULTS.thickness, ...(cons ? { sizeMode: cons.sizeMode } : {}) };
}
