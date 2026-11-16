import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";
import { storage } from "@/server/storage";

const MAX_ASSETS_PER_USER = 1000;
const MAX_BYTES_PER_USER = 1024 * 1024 * 1024;

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });
const body = z.object({ artworkId: z.string().min(1).max(60), projectId: z.string().min(1).max(60).optional() });
const select = { id: true, fileName: true, fileType: true, sizeBytes: true } as const;

/**
 * Use an artwork-library picture in a project. The customer gets a private copy (an Asset of their own,
 * so exports and the 3D view work like for any upload). The copy is made once per picture and user:
 * its storage key is fixed ("<user>/lib-<picture>"), and the editor's "My uploads" list leaves those out.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;

  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(400, "Invalid request.");
  const item = await db.artworkItem.findUnique({ where: { id: p.data.artworkId }, select: { id: true, name: true, mime: true, sizeBytes: true, storageKey: true } });
  if (!item) return fail(404, "Picture not found.");

  const ext = item.mime === "image/png" ? "png" : "jpg";
  const storageKey = `${userId}/lib-${item.id}.${ext}`;
  const existing = await db.asset.findUnique({ where: { storageKey }, select });
  if (existing) return NextResponse.json({ asset: existing });

  if (!(await takeToken(userId, "upload", LIMITS.upload.max, LIMITS.upload.windowSec))) return fail(429, "Too many uploads. Please wait a minute.");
  let projectId: string | null = null;
  if (p.data.projectId) {
    const owned = await db.project.findFirst({ where: { id: p.data.projectId, userId }, select: { id: true } });
    if (!owned) return fail(404, "Project not found.");
    projectId = owned.id;
  }
  const bytes = await storage.get(item.storageKey);
  if (!bytes) return fail(404, "Picture file is missing.");

  const fileName = `${item.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100)}.${ext}`;
  try {
    const asset = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`asset:${userId}`}, 0))`;
      const usage = await tx.asset.aggregate({ where: { userId }, _count: true, _sum: { sizeBytes: true } });
      if (usage._count >= MAX_ASSETS_PER_USER || (usage._sum.sizeBytes ?? 0) + bytes.length > MAX_BYTES_PER_USER) return null;
      return tx.asset.create({ data: { userId, projectId, fileName, fileType: item.mime, sizeBytes: bytes.length, storageKey }, select });
    });
    if (!asset) return fail(507, "Storage limit reached.");
    try {
      await storage.put(storageKey, new Uint8Array(bytes));
    } catch {
      await db.asset.deleteMany({ where: { storageKey } });
      return fail(500, "Could not store the file.");
    }
    return NextResponse.json({ asset }, { status: 201 });
  } catch {
    // Two requests for the same picture at once: the other one made the row.
    const again = await db.asset.findUnique({ where: { storageKey }, select });
    return again ? NextResponse.json({ asset: again }) : fail(500, "Could not save the picture.");
  }
}
