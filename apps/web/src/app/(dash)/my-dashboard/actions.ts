"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPreset } from "@packaging/dieline-engine";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { MAX_CATEGORIES, MAX_TAGS } from "@/server/my-templates";
import { importedStartParams, loadImportedSource } from "@/server/imported-templates";
import { createProjectDraft } from "@/app/(app)/projects/actions";

export type MyResult = { ok: boolean; message: string; id?: string };

const nameSchema = z.string().trim().min(1, "Enter a name.").max(40, "That name is too long (40 characters max).");
const idSchema = z.string().min(1).max(60);

const refresh = () => {
  revalidatePath("/my-dashboard");
  revalidatePath("/projects");
};
const isDuplicate = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** Make a category of the customer's own. */
export async function createCategory(name: string): Promise<MyResult> {
  const user = await requireUser();
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, message: n.error.issues[0]!.message };
  if ((await db.userCategory.count({ where: { userId: user.id } })) >= MAX_CATEGORIES) return { ok: false, message: `You can keep up to ${MAX_CATEGORIES} categories.` };
  if (await db.userCategory.findFirst({ where: { userId: user.id, name: { equals: n.data, mode: "insensitive" } }, select: { id: true } })) return { ok: false, message: "You already have a category with that name." };
  try {
    const c = await db.userCategory.create({ data: { userId: user.id, name: n.data }, select: { id: true } });
    refresh();
    return { ok: true, message: `Category "${n.data}" added.`, id: c.id };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, message: "You already have a category with that name." };
    throw e;
  }
}

export async function renameCategory(id: string, name: string): Promise<MyResult> {
  const user = await requireUser();
  const n = nameSchema.safeParse(name);
  if (!idSchema.safeParse(id).success || !n.success) return { ok: false, message: n.success ? "Invalid request." : n.error.issues[0]!.message };
  if (await db.userCategory.findFirst({ where: { userId: user.id, id: { not: id }, name: { equals: n.data, mode: "insensitive" } }, select: { id: true } })) return { ok: false, message: "You already have a category with that name." };
  try {
    const r = await db.userCategory.updateMany({ where: { id, userId: user.id }, data: { name: n.data } });
    if (r.count === 0) return { ok: false, message: "Category not found." };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, message: "You already have a category with that name." };
    throw e;
  }
  refresh();
  return { ok: true, message: "Category renamed." };
}

export async function renameTag(id: string, name: string): Promise<MyResult> {
  const user = await requireUser();
  const n = nameSchema.safeParse(name);
  if (!idSchema.safeParse(id).success || !n.success) return { ok: false, message: n.success ? "Invalid request." : n.error.issues[0]!.message };
  if (await db.userTag.findFirst({ where: { userId: user.id, id: { not: id }, name: { equals: n.data, mode: "insensitive" } }, select: { id: true } })) return { ok: false, message: "You already have a tag with that name." };
  try {
    const r = await db.userTag.updateMany({ where: { id, userId: user.id }, data: { name: n.data } });
    if (r.count === 0) return { ok: false, message: "Tag not found." };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, message: "You already have a tag with that name." };
    throw e;
  }
  refresh();
  return { ok: true, message: "Tag renamed." };
}

/** Delete a category. Its templates stay, just without a category. */
export async function deleteCategory(id: string): Promise<MyResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const r = await db.userCategory.deleteMany({ where: { id, userId: user.id } });
  if (r.count === 0) return { ok: false, message: "Category not found." };
  refresh();
  return { ok: true, message: "Category deleted. Its templates are kept." };
}

export async function createTag(name: string): Promise<MyResult> {
  const user = await requireUser();
  const n = nameSchema.safeParse(name);
  if (!n.success) return { ok: false, message: n.error.issues[0]!.message };
  if ((await db.userTag.count({ where: { userId: user.id } })) >= MAX_TAGS) return { ok: false, message: `You can keep up to ${MAX_TAGS} tags.` };
  if (await db.userTag.findFirst({ where: { userId: user.id, name: { equals: n.data, mode: "insensitive" } }, select: { id: true } })) return { ok: false, message: "You already have a tag with that name." };
  try {
    const t = await db.userTag.create({ data: { userId: user.id, name: n.data }, select: { id: true } });
    refresh();
    return { ok: true, message: `Tag "${n.data}" added.`, id: t.id };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, message: "You already have a tag with that name." };
    throw e;
  }
}

/** Delete a tag. It is taken off every template; the templates stay. */
export async function deleteTag(id: string): Promise<MyResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const r = await db.userTag.deleteMany({ where: { id, userId: user.id } });
  if (r.count === 0) return { ok: false, message: "Tag not found." };
  refresh();
  return { ok: true, message: "Tag deleted. Its templates are kept." };
}

/** Put a template in one of the customer's categories (null = none). */
export async function setTemplateCategory(projectId: string, categoryId: string | null): Promise<MyResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(projectId).success || (categoryId !== null && !idSchema.safeParse(categoryId).success)) return { ok: false, message: "Invalid request." };
  if (categoryId !== null && !(await db.userCategory.findFirst({ where: { id: categoryId, userId: user.id }, select: { id: true } }))) return { ok: false, message: "Category not found." };
  const r = await db.project.updateMany({ where: { id: projectId, userId: user.id }, data: { categoryId } });
  if (r.count === 0) return { ok: false, message: "Template not found." };
  refresh();
  return { ok: true, message: categoryId ? "Category set." : "Category removed." };
}

/** Replace the tags of a template with exactly these (all must be the customer's own). */
export async function setTemplateTags(projectId: string, tagIds: string[]): Promise<MyResult> {
  const user = await requireUser();
  const ids = z.array(idSchema).max(MAX_TAGS).safeParse(tagIds);
  if (!idSchema.safeParse(projectId).success || !ids.success) return { ok: false, message: "Invalid request." };
  const unique = [...new Set(ids.data)];
  const project = await db.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
  if (!project) return { ok: false, message: "Template not found." };
  if (unique.length > 0 && (await db.userTag.count({ where: { id: { in: unique }, userId: user.id } })) !== unique.length) return { ok: false, message: "Tag not found." };
  await db.$transaction([
    db.projectTag.deleteMany({ where: { projectId, tagId: { notIn: unique } } }),
    db.projectTag.createMany({ data: unique.map((tagId) => ({ projectId, tagId })), skipDuplicates: true }),
  ]);
  refresh();
  return { ok: true, message: "Tags saved." };
}

/** Delete one of the customer's templates. */
export async function deleteMyTemplate(projectId: string): Promise<MyResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Invalid request." };
  const r = await db.project.deleteMany({ where: { id: projectId, userId: user.id } });
  if (r.count === 0) return { ok: false, message: "Template not found." };
  refresh();
  return { ok: true, message: "Template deleted." };
}

/**
 * Add a system (published) template to the customer's own list: a new project that starts with the
 * template's standard size and material, then open it from the list to change it.
 */
export async function addSystemTemplate(templateId: string, categoryId: string | null = null): Promise<MyResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(templateId).success) return { ok: false, message: "Invalid request." };
  if (categoryId !== null && !(await db.userCategory.findFirst({ where: { id: categoryId, userId: user.id }, select: { id: true } }))) return { ok: false, message: "Category not found." };
  const row = await db.template.findFirst({ where: { id: templateId, published: true }, select: { id: true, name: true, source: true, defaultThickness: true } });
  if (!row) return { ok: false, message: "This template is not available." };

  let params: Record<string, unknown>;
  if (row.source === "svg") {
    const imported = await loadImportedSource(row.id);
    if (!imported) return { ok: false, message: "This template is not available." };
    params = { ...importedStartParams(imported.flat, imported.fold) };
  } else {
    const preset = getPreset(row.id);
    if (!preset) return { ok: false, message: "This template is not available." };
    params = { ...preset.defaults, ...(row.defaultThickness ? { thickness: row.defaultThickness } : {}) };
  }
  const fd = new FormData();
  fd.set("presetId", row.id);
  fd.set("name", row.name);
  fd.set("params", JSON.stringify(params));
  const r = await createProjectDraft(fd);
  if (!r.ok || !r.id) return { ok: false, message: r.message ?? "Could not add this template." };
  if (categoryId) await db.project.updateMany({ where: { id: r.id, userId: user.id }, data: { categoryId } });
  refresh();
  return { ok: true, message: `"${row.name}" added to your templates.`, id: r.id };
}
