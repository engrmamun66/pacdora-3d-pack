"use server";

import { MAX_ARTWORK_JSON_BYTES, artworkSchema, parseProjectDoc, projectDocV1 } from "@packaging/schema";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

export type SaveResult = { ok: true; savedAt: string } | { ok: false; message: string };

/** Replace the artwork of a project the user owns. Fully re-validated on the server. */
export async function saveArtwork(projectId: string, artwork: unknown): Promise<SaveResult> {
  const user = await requireUser();
  if (typeof projectId !== "string" || projectId.length > 40) return { ok: false, message: "Invalid project." };
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(artwork)).length;
  } catch {
    return { ok: false, message: "Artwork is not valid JSON." };
  }
  if (size > MAX_ARTWORK_JSON_BYTES) return { ok: false, message: "Artwork is too large (over 1 MB of data)." };
  const parsed = artworkSchema.safeParse(artwork);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, message: `Invalid artwork: ${i?.path.join(".")} ${i?.message}` };
  }

  // Every referenced image must belong to this user.
  const assetIds = [...new Set(parsed.data.objects.flatMap((o) => (o.type === "image" ? [o.assetId] : [])))];
  if (assetIds.length) {
    const owned = await db.asset.count({ where: { id: { in: assetIds }, userId: user.id } });
    if (owned !== assetIds.length) return { ok: false, message: "Artwork references an image you do not own." };
  }

  const row = await db.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!row) return { ok: false, message: "Project not found." };
  const doc = parseProjectDoc(row.projectData);
  const next = parseProjectDoc({ ...doc, artwork: parsed.data });
  // No revalidatePath: it would refresh the editor's props mid-session. Project pages read live data.
  const saved = await db.project.update({ where: { id: row.id }, data: { projectData: next }, select: { updatedAt: true } });
  return { ok: true, savedAt: saved.updatedAt.toISOString() };
}

const threeDSchema = projectDocV1.shape.threeD;

/** Save 3D preview settings (fold, board and inside colours) of a project the user owns. */
export async function saveThreeD(projectId: string, settings: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = threeDSchema.safeParse(settings);
  if (!parsed.success || typeof projectId !== "string") return { ok: false, message: "Invalid 3D settings." };
  const row = await db.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!row) return { ok: false, message: "Project not found." };
  const doc = parseProjectDoc(row.projectData);
  const saved = await db.project.update({
    where: { id: row.id },
    data: { projectData: parseProjectDoc({ ...doc, threeD: parsed.data }) },
    select: { updatedAt: true },
  });
  return { ok: true, savedAt: saved.updatedAt.toISOString() };
}
