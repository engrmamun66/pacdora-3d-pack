import "server-only";
import { ENGINE_VERSION, getPreset, templateCatalog } from "@packaging/dieline-engine";
import { newProjectDoc, parseProjectDoc, type Artwork, type ProjectDoc } from "@packaging/schema";
import { db } from "./db";
import { claimNameAndSlug } from "./project-names";
import { resolveGenerator } from "./imported-templates";
import { SAMPLE_BOXES } from "@/lib/sample-boxes";

/**
 * Make the project a layout design is drawn in: a normal project of the admin on the sample box (its generator and sizes), so the
 * online design editor can be used on it as it is. Returns the project id, or an error message.
 */
export async function createDesignProject(adminId: string, name: string, boxId: string): Promise<{ projectId: string } | { error: string }> {
  const box = SAMPLE_BOXES.find((b) => b.id === boxId);
  if (!box) return { error: "Unknown box." };
  // A project belongs to a catalogue template; any built-in template of the same box type will do (its sizes are replaced by the sample box's).
  const preset = templateCatalog.find((p) => p.generatorId === box.generatorId);
  const real = preset ? getPreset(preset.id) : undefined;
  if (!real) return { error: "No template for this box." };
  const generator = await resolveGenerator(box.generatorId, real.id);
  if (!generator) return { error: "This box is not available." };
  const claimed = await claimNameAndSlug(adminId, `Icon design: ${name}`, null, false);
  if ("error" in claimed) return { error: claimed.error };
  const doc = newProjectDoc({ name: claimed.name, presetId: real.id, generatorId: generator.id, generatorSchemaVersion: generator.schemaVersion, engineVersion: ENGINE_VERSION, params: box.params as Record<string, string | number | boolean> });
  await db.template.upsert({
    where: { id: real.id },
    create: { id: real.id, generatorId: real.generatorId, name: real.name, category: real.category, description: real.description, schemaVersion: generator.schemaVersion, defaultParameters: real.defaults as object },
    update: {},
  });
  const project = await db.project.create({ data: { userId: adminId, name: claimed.name, slug: claimed.slug, templateId: real.id, projectData: doc }, select: { id: true } });
  return { projectId: project.id };
}

/** What the sample box is dressed in: the artwork of the design's project and its board colours. Null when the design or its file is gone. */
export async function loadDesignLook(designId: string): Promise<{ artwork: Artwork; outsideColor: string; insideColor: string; boxId: string } | null> {
  const row = await db.layoutDesign.findUnique({ where: { id: designId }, select: { boxId: true, project: { select: { projectData: true } } } });
  if (!row) return null;
  let doc: ProjectDoc;
  try {
    doc = parseProjectDoc(row.project.projectData);
  } catch {
    return null;
  }
  return { artwork: doc.artwork, outsideColor: doc.threeD.outsideColor, insideColor: doc.threeD.insideColor, boxId: row.boxId };
}
