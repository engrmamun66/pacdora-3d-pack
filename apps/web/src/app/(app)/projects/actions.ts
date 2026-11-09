"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ENGINE_VERSION, ParamValidationError, getGenerator, getPreset } from "@packaging/dieline-engine";
import { newProjectDoc, parseProjectDoc } from "@packaging/schema";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { copyTemplateBackground } from "@/server/template-background";

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

/** Validate params with the engine itself; returns issues instead of throwing. */
function validateWithEngine(generatorId: string, params: Record<string, unknown>): DesignState | null {
  try {
    getGenerator(generatorId).generate(params);
    return null;
  } catch (e) {
    if (e instanceof ParamValidationError) return { ok: false, message: "Please fix the highlighted values.", issues: [...e.issues] };
    return { ok: false, message: "These parameters do not produce a valid dieline.", issues: [] };
  }
}

/** Shared by both create actions: validate everything, insert, return the new id (or a form state). */
async function insertProject(formData: FormData): Promise<{ id: string } | DesignState> {
  const user = await requireUser();
  const preset = getPreset(String(formData.get("presetId") ?? ""));
  if (!preset) return { ok: false, message: "Unknown template.", issues: [] };
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, message: name.error.issues[0]!.message, issues: [] };
  const params = readParams(formData.get("params"));
  if (!params) return { ok: false, message: "Invalid parameters.", issues: [] };

  const invalid = validateWithEngine(preset.generatorId, params);
  if (invalid) return invalid;

  const gen = getGenerator(preset.generatorId);
  const doc = newProjectDoc({
    name: name.data,
    presetId: preset.id,
    generatorId: gen.id,
    generatorSchemaVersion: gen.schemaVersion,
    engineVersion: ENGINE_VERSION,
    params,
  });
  // Keep the catalogue row in sync (code is the source of truth for presets).
  await db.template.upsert({
    where: { id: preset.id },
    create: {
      id: preset.id,
      generatorId: preset.generatorId,
      name: preset.name,
      category: preset.category,
      description: preset.description,
      schemaVersion: gen.schemaVersion,
      defaultParameters: preset.defaults as object,
    },
    update: {},
  });
  const project = await db.project.create({
    data: { userId: user.id, name: name.data, templateId: preset.id, projectData: doc },
    select: { id: true },
  });
  // A template's box background (set by an admin) becomes the project's starting background.
  const bg = await copyTemplateBackground(preset.id, user.id, project.id);
  if (bg) {
    await db.project.update({ where: { id: project.id }, data: { projectData: parseProjectDoc({ ...doc, artwork: { objects: [], background: bg } }) } });
  }
  revalidatePath("/projects");
  return { id: project.id };
}

/** Create a project from a catalogue preset, then open it. */
export async function createProject(_prev: DesignState, formData: FormData): Promise<DesignState> {
  const r = await insertProject(formData);
  if ("id" in r) redirect(`/projects/${r.id}`);
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
  const invalid = validateWithEngine(doc.template.generatorId, params);
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
