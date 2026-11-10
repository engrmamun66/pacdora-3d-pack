import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/image-sniff";
import { IDENTITY_FILES, type IdentityFile } from "@/lib/site-identity";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { IDENTITY_TAG, readSiteIdentity, writeSiteIdentity } from "@/server/site-identity";
import { storage } from "@/server/storage";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Logo up to 2 MB, favicon up to 512 KB: both are small by nature. */
const MAX_BYTES: Record<IdentityFile, number> = { logo: 2 * 1024 * 1024, favicon: 512 * 1024 };

/** Super admins only; the role is read from the database, never from the request. */
async function adminId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, banned: true, emailVerified: true } });
  return u && u.role === "superadmin" && !u.banned && u.emailVerified ? u.id : null;
}

const refresh = () => {
  revalidateTag(IDENTITY_TAG, { expire: 0 });
  revalidatePath("/", "layout"); // every page shows the logo and the tab title
};

const fileKey = (kind: IdentityFile) => (kind === "logo" ? "logoKey" : "faviconKey") as "logoKey" | "faviconKey";

/** Replace the logo or the favicon. Multipart fields: "kind" (logo | favicon), "file" (PNG or JPEG). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const id = await adminId(request);
  if (!id) return fail(403, "Super admin only.");

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Content-Length is required.");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "File is too large.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (typeof kind !== "string" || !IDENTITY_FILES.includes(kind as IdentityFile)) return fail(400, "Choose logo or favicon.");
  const k = kind as IdentityFile;
  if (!(file instanceof File) || file.size === 0) return fail(400, "No file uploaded.");
  if (file.size > MAX_BYTES[k]) return fail(413, `The ${k} must be smaller than ${MAX_BYTES[k] / 1024 >= 1024 ? `${MAX_BYTES[k] / 1024 / 1024} MB` : `${MAX_BYTES[k] / 1024} KB`}.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return fail(415, "Only PNG and JPEG images are supported.");
  const size = imageSize(bytes, type.mime);
  const problem = imageSizeProblem(size);
  if (problem || !size) return fail(422, `This image cannot be used: ${problem ?? "unreadable size"}.`);
  if (k === "favicon" && (size.width !== size.height || size.width < 32)) return fail(422, "The favicon must be square and at least 32 x 32 pixels.");

  const key = `site/${randomUUID()}.${type.ext}`;
  try {
    await storage.put(key, bytes);
  } catch {
    return fail(500, "Could not store the file.");
  }
  let old: string | null = null;
  try {
    const { identity } = await readSiteIdentity();
    old = identity[fileKey(k)];
    await writeSiteIdentity({ ...identity, [fileKey(k)]: key }, id);
  } catch {
    await storage.delete(key).catch(() => undefined);
    return fail(500, "Could not save the setting.");
  }
  if (old) await storage.delete(old).catch(() => undefined);
  refresh();
  return NextResponse.json({ ok: true, url: `/api/site/${k}?v=${key.slice("site/".length, -4)}` }, { status: 201 });
}

/** Remove the logo or favicon (back to the default). Query: ?kind=logo|favicon */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const id = await adminId(request);
  if (!id) return fail(403, "Super admin only.");
  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  if (!IDENTITY_FILES.includes(kind as IdentityFile)) return fail(400, "Choose logo or favicon.");
  const k = kind as IdentityFile;
  const { identity } = await readSiteIdentity();
  const old = identity[fileKey(k)];
  await writeSiteIdentity({ ...identity, [fileKey(k)]: null }, id);
  if (old) await storage.delete(old).catch(() => undefined);
  refresh();
  return NextResponse.json({ ok: true });
}
