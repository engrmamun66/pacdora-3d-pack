import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";
import { storage } from "@/server/storage";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/image-sniff";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

const MAX_ASSETS_PER_USER = 1000;
const MAX_BYTES_PER_USER = 1024 * 1024 * 1024;

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Upload an image (PNG or JPEG) for the signed-in user. Multipart field "file", optional "projectId". */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  if (!(await takeToken(userId, "upload", LIMITS.upload.max, LIMITS.upload.windowSec))) {
    return fail(429, "Too many uploads. Please wait a minute.");
  }

  // Chunked bodies carry no Content-Length and request.formData() would buffer all of it: refuse them.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Content-Length is required.");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "File is larger than 10 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file uploaded.");
  if (file.size === 0) return fail(400, "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, "File is larger than 10 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return fail(415, "Only PNG and JPEG images are supported.");
  // A tiny file can declare billions of pixels (decompression bomb): check the header before anything decodes it.
  const sizeProblem = imageSizeProblem(imageSize(bytes, type.mime));
  if (sizeProblem) return fail(422, `This image cannot be used: ${sizeProblem}.`);

  const projectIdRaw = form.get("projectId");
  let projectId: string | null = null;
  if (typeof projectIdRaw === "string" && projectIdRaw) {
    const owned = await db.project.findFirst({ where: { id: projectIdRaw, userId }, select: { id: true } });
    if (!owned) return fail(404, "Project not found.");
    projectId = owned.id;
  }

  // Reserve the quota and the row atomically (per-user lock), then write the file; undo the row if the write fails.
  const storageKey = `${userId}/${randomUUID()}.${type.ext}`;
  const fileName = (file.name || `image.${type.ext}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const asset = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`asset:${userId}`}, 0))`;
    const usage = await tx.asset.aggregate({ where: { userId }, _count: true, _sum: { sizeBytes: true } });
    if (usage._count >= MAX_ASSETS_PER_USER || (usage._sum.sizeBytes ?? 0) + bytes.length > MAX_BYTES_PER_USER) return null;
    return tx.asset.create({
      data: { userId, projectId, fileName, fileType: type.mime, sizeBytes: bytes.length, storageKey },
      select: { id: true, fileName: true, fileType: true, sizeBytes: true },
    });
  });
  if (!asset) return fail(507, "Storage limit reached.");
  try {
    await storage.put(storageKey, bytes);
  } catch {
    await db.asset.deleteMany({ where: { storageKey } });
    return fail(500, "Could not store the file.");
  }
  return NextResponse.json({ asset }, { status: 201 });
}
