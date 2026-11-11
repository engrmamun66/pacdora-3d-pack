"use server";

import { requireUser } from "@/server/session";
import { listProjects } from "@/server/projects";
import { projectThumbnail } from "@/lib/dieline-preview";
import { getPublicCatalogue, type PublicCategory, type PublicTemplate } from "@/server/templates-public";

/** The published templates (cached) for the "Dielines" list on the dieline page. Signed-in users only. */
export async function loadTemplatePicker(): Promise<{ templates: PublicTemplate[]; categories: PublicCategory[] }> {
  await requireUser();
  const { templates, categories } = await getPublicCatalogue();
  return { templates, categories };
}

/** One of the signed-in user's own saved projects, for the "My templates" list. */
export interface MyTemplate {
  id: string;
  name: string;
  /** The template it was made from. */
  templateName: string;
  updatedAt: string;
  thumbnail: string | null;
}

/** The signed-in user's own projects, newest first. Always scoped to the session user. */
export async function loadMyTemplates(): Promise<MyTemplate[]> {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    templateName: p.template.name,
    updatedAt: p.updatedAt.toISOString().slice(0, 10),
    thumbnail: p.doc ? projectThumbnail(p.template, p.doc.template.generatorId, p.doc.template.params) : null,
  }));
}
