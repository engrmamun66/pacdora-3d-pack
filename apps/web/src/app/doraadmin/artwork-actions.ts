"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanCategory, cleanName, parseTags } from "@/lib/artwork-meta";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { storage } from "@/server/storage";
import type { ActionResult } from "./template-category-actions";

const idParam = z.string().min(1).max(60);

const updateSchema = z.object({
  id: idParam,
  name: z.string().max(400),
  tags: z.string().max(2000),
  category: z.string().max(400),
});

/** Change the name, tags and category of a library picture (the file itself stays). */
export async function updateArtwork(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const name = cleanName(p.data.name);
  if (name.length < 2) return { ok: false, message: "Name must be at least 2 characters." };
  const tags = parseTags(p.data.tags);
  if (tags.length === 0) return { ok: false, message: "Add at least one tag." };
  const r = await db.artworkItem.updateMany({ where: { id: p.data.id }, data: { name, tags, category: cleanCategory(p.data.category) } });
  if (r.count === 0) return { ok: false, message: "Artwork not found." };
  revalidatePath("/doraadmin/artworks");
  return { ok: true, message: "Artwork saved." };
}

/** Remove a picture from the library and delete its file. */
export async function deleteArtwork(id: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const p = idParam.safeParse(id);
  if (!p.success) return { ok: false, message: "Invalid request." };
  const row = await db.artworkItem.findUnique({ where: { id: p.data }, select: { storageKey: true } });
  if (!row) return { ok: false, message: "Artwork not found." };
  await db.artworkItem.delete({ where: { id: p.data } });
  await storage.delete(row.storageKey).catch(() => undefined);
  revalidatePath("/doraadmin/artworks");
  return { ok: true, message: "Artwork deleted." };
}
