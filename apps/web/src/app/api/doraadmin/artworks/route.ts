import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { cleanCategory, cleanName, parseTags } from "@/lib/artwork-meta";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/image-sniff";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { storage } from "@/server/storage";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Super admins only; the role is read from the database, never from the request. */
async function adminId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, banned: true, emailVerified: true } });
  return u && u.role === "superadmin" && !u.banned && u.emailVerified ? u.id : null;
}

/** Add a picture to the artwork library. Multipart fields: "file" (PNG or JPEG, 10 MB max), "name", "tags" (comma list), "category" (optional). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const userId = await adminId(request);
  if (!userId) return fail(403, "Super admin only.");

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
  const rawName = form.get("name");
  const rawTags = form.get("tags");
  const rawCategory = form.get("category");
  if (!(file instanceof File) || file.size === 0) return fail(400, "Choose a picture to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, "File is larger than 10 MB.");
  const name = cleanName(typeof rawName === "string" ? rawName : "");
  if (name.length < 2) return fail(400, "Name must be at least 2 characters.");
  const tags = parseTags(typeof rawTags === "string" ? rawTags : "");
  if (tags.length === 0) return fail(400, "Add at least one tag.");
  const category = cleanCategory(typeof rawCategory === "string" ? rawCategory : "");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return fail(415, "Only PNG and JPEG pictures can be added.");
  const size = imageSize(bytes, type.mime);
  const problem = imageSizeProblem(size);
  if (problem || !size) return fail(422, `This image cannot be used: ${problem ?? "unreadable size"}.`);

  const key = `artworks/${randomUUID()}.${type.ext}`;
  try {
    await storage.put(key, bytes);
  } catch {
    return fail(500, "Could not store the file.");
  }
  try {
    const row = await db.artworkItem.create({
      data: { name, tags, category, storageKey: key, mime: type.mime, widthPx: size.width, heightPx: size.height, sizeBytes: bytes.length, createdById: userId },
      select: { id: true },
    });
    revalidatePath("/doraadmin/artworks");
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch {
    await storage.delete(key).catch(() => undefined);
    return fail(500, "Could not save the artwork.");
  }
}
