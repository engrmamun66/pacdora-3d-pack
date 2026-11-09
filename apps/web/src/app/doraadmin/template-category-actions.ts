"use server";

import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { TEMPLATES_TAG } from "@/server/templates-public";
import { isValidSlug, slugify } from "@/lib/slug";

export type ActionResult = { ok: boolean; message: string };

const base = z.object({
  kind: z.enum(["use", "model"]),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60, "Name is too long (60 characters max)."),
  slug: z.string().trim().max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  active: z.boolean().default(true),
});

function refresh() {
  revalidatePath("/doraadmin/template-categories");
  revalidatePath("/doraadmin/templates");
  revalidatePath("/templates");
  updateTag(TEMPLATES_TAG);
}

const dupMessage = "A category with that slug already exists in this group.";

export async function createCategory(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = base.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  const slug = p.data.slug ? p.data.slug : slugify(p.data.name);
  if (!isValidSlug(slug)) return { ok: false, message: "Slug may use lowercase letters, digits and single dashes (2 to 80 characters)." };
  try {
    await db.templateCategory.create({ data: { kind: p.data.kind, name: p.data.name, slug, sortOrder: p.data.sortOrder, active: p.data.active } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: dupMessage };
    throw e;
  }
  refresh();
  return { ok: true, message: `Category "${p.data.name}" added.` };
}

const updateSchema = base.extend({ id: z.string().min(1).max(60) });

export async function updateCategory(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]!.message };
  const slug = p.data.slug ? p.data.slug : slugify(p.data.name);
  if (!isValidSlug(slug)) return { ok: false, message: "Slug may use lowercase letters, digits and single dashes (2 to 80 characters)." };
  try {
    await db.templateCategory.update({
      where: { id: p.data.id },
      data: { kind: p.data.kind, name: p.data.name, slug, sortOrder: p.data.sortOrder, active: p.data.active },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, message: dupMessage };
      if (e.code === "P2025") return { ok: false, message: "Category not found." };
    }
    throw e;
  }
  refresh();
  return { ok: true, message: "Category saved." };
}

/** Deleting a category only removes the links; templates stay. */
export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  if (typeof id !== "string" || id.length === 0 || id.length > 60) return { ok: false, message: "Invalid request." };
  const r = await db.templateCategory.deleteMany({ where: { id } });
  if (r.count === 0) return { ok: false, message: "Category not found." };
  refresh();
  return { ok: true, message: "Category deleted. Templates in it were kept." };
}
