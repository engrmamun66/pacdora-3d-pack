"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ENGINE_VERSION, IMPORTED_GENERATOR_ID, ParamValidationError, getPreset, type GeneratorDefinition } from "@packaging/dieline-engine";
import { newProjectDoc, parseProjectDoc } from "@packaging/schema";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { resolveGenerator } from "@/server/imported-templates";
import { copyTemplateBackground } from "@/server/template-background";
import { readViewSettings } from "@/lib/view-settings";

export type DesignState = { ok: boolean; message: string | null; issues: { path: string; message: string }[] };

const MAX_PARAMS_JSON = 10_000;
const paramsSchema = z.record(z.string().max(60), z.union([z.number().finite(), z.string().max(100), z.boolean()]));
const nameSchema = z.string().trim().min(1, "Project name is required").max(120, "Name is too long");

function readParams(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.length > MAX_PARAMS_JSON) return null;
  try {
    const parsed = paramsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Validate params with the generator itself; returns issues instead of throwing. */
function validateWithEngine(gen: GeneratorDefinition, params: Record<string, unknown>): DesignState | null {
  try {
    gen.generate(params);
    return null;
  } catch (e) {
    if (e instanceof ParamValidationError) return { ok: false, message: "Please fix the highlighted values.", issues: [...e.issues] };
    return { ok: false, message: "These parameters do not produce a valid dieline.", issues: [] };
  }
}

/** Shared by both create actions: validate everything, insert, return the new id (or a form state). */
async function insertProject(formData: FormData): Promise<{ id: string } | DesignState> {
  const user = await requireUser();
  const presetId = String(formData.get("presetId") ?? "");
  const builtin = getPreset(presetId);
  // An imported (SVG) template must exist and be published to start a new project from it.
  const importedRow = builtin ? null : await db.template.findFirst({ where: { id: presetId, source: "svg", published: true }, select: { id: true } });
  if (!builtin && !importedRow) return { ok: false, message: "Unknown template.", issues: [] };
  const generator = await resolveGenerator(builtin ? builtin.generatorId : IMPORTED_GENERATOR_ID, presetId);
  if (!generator) return { ok: false, message: "This template is not available.", issues: [] };
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, message: name.error.issues[0]!.message, issues: [] };
  const params = readParams(formData.get("params"));
  if (!params) return { ok: false, message: "Invalid parameters.", issues: [] };

  const invalid = validateWithEngine(generator, params);
  if (invalid) return invalid;

  const baseDoc = newProjectDoc({
    name: name.data,
    presetId,
    generatorId: generator.id,
    generatorSchemaVersion: generator.schemaVersion,
    engineVersion: ENGINE_VERSION,
    params,
  });
  // The editor's 3D view starts at the fold amount the admin saved in "Starting 3D view" (the camera comes from the template itself).
  const startView = readViewSettings((await db.template.findUnique({ where: { id: presetId }, select: { viewSettings: true } }))?.viewSettings ?? null);
  const doc = startView ? { ...baseDoc, threeD: { ...baseDoc.threeD, foldProgress: startView.progress } } : baseDoc;
  if (builtin) {
    // Keep the catalogue row in sync (code is the source of truth for built-in presets).
    await db.template.upsert({
      where: { id: builtin.id },
      create: {
        id: builtin.id,
        generatorId: builtin.generatorId,
        name: builtin.name,
        category: builtin.category,
        description: builtin.description,
        schemaVersion: generator.schemaVersion,
        defaultParameters: builtin.defaults as object,
      },
      update: {},
    });
  }
  const project = await db.project.create({
    data: { userId: user.id, name: name.data, templateId: presetId, projectData: doc },
    select: { id: true },
  });
  // A template's box background (set by an admin) becomes the project's starting background.
  const bg = await copyTemplateBackground(presetId, user.id, project.id);
  if (bg) {
    await db.project.update({ where: { id: project.id }, data: { projectData: parseProjectDoc({ ...doc, artwork: { objects: [], background: bg } }) } });
  }
  revalidatePath("/projects");
  return { id: project.id };
}

/** Create a project from a catalogue preset, then open it. */
export async function createProject(_prev: DesignState, formData: FormData): Promise<DesignState> {
  const r = await insertProject(formData);
  // "Design online" creates the project and goes straight to the artwork editor.
  if ("id" in r) redirect(formData.get("next") === "editor" ? `/editor/${r.id}` : `/projects/${r.id}`);
  return r;
}

/** Create a project and return its id without redirecting (the workspace saves before a download). */
export async function createProjectDraft(formData: FormData): Promise<DesignState & { id: string | null }> {
  const r = await insertProject(formData);
  return "id" in r ? { ok: true, message: "Saved.", issues: [], id: r.id } : { ...r, id: null };
}

/** Save new parameters (and name) for an existing project the user owns. */
export async function updateProject(_prev: DesignState, formData: FormData): Promise<DesignState> {
  const user = await requireUser();
  const id = String(formData.get("projectId") ?? "");
  const row = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!row) return { ok: false, message: "Project not found.", issues: [] };
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, message: name.error.issues[0]!.message, issues: [] };
  const params = readParams(formData.get("params"));
  if (!params) return { ok: false, message: "Invalid parameters.", issues: [] };

  let doc;
  try {
    doc = parseProjectDoc(row.projectData);
  } catch {
    return { ok: false, message: "This project file could not be read.", issues: [] };
  }
  const generator = await resolveGenerator(doc.template.generatorId, doc.template.presetId);
  if (!generator) return { ok: false, message: "This project's template is no longer available.", issues: [] };
  const invalid = validateWithEngine(generator, params);
  if (invalid) return invalid;

  const next = parseProjectDoc({
    ...doc,
    meta: { ...doc.meta, name: name.data, engineVersion: ENGINE_VERSION },
    template: { ...doc.template, params },
  });
  await db.project.update({ where: { id: row.id }, data: { name: name.data, projectData: next } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${row.id}`);
  return { ok: true, message: "Saved.", issues: [] };
}

/** Delete a project the user owns. */
export async function deleteProject(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("projectId") ?? "");
  await db.project.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/projects");
  redirect("/projects");
}
