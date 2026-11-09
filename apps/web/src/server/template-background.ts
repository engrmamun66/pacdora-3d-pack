import "server-only";
import { randomUUID } from "node:crypto";
import type { BoxBackground } from "@packaging/schema";
import { db } from "./db";
import { storage } from "./storage";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Give a new project the box background its template has (if any): the file is
 * copied into the user's own images, because artwork may only reference
 * images the user owns. Best effort: returns null on any problem so that
 * creating a project never fails because of it.
 */
export async function copyTemplateBackground(templateId: string, userId: string, projectId: string): Promise<BoxBackground | null> {
  try {
    const t = await db.template.findUnique({ where: { id: templateId }, select: { backgroundKey: true, backgroundMime: true, name: true } });
    if (!t?.backgroundKey || !t.backgroundMime || !EXT[t.backgroundMime]) return null;
    const bytes = await storage.get(t.backgroundKey);
    if (!bytes) return null;
    const storageKey = `${userId}/${randomUUID()}.${EXT[t.backgroundMime]}`;
    await storage.put(storageKey, bytes);
    const asset = await db.asset.create({
      data: { userId, projectId, fileName: `${t.name} background.${EXT[t.backgroundMime]}`.slice(0, 120), fileType: t.backgroundMime, sizeBytes: bytes.length, storageKey },
      select: { id: true },
    });
    return { assetId: asset.id, fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 };
  } catch {
    return null;
  }
}
