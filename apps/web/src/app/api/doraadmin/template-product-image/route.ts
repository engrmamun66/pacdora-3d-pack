import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/image-sniff";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { storage } from "@/server/storage";
import { TEMPLATES_TAG } from "@/server/templates-public";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Super admins only; the role is read from the database, never from the request. */
async function adminId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, banned: true, emailVerified: true } });
  return u && u.role === "superadmin" && !u.banned && u.emailVerified ? u.id : null;
}

const refresh = (slug: string) => {
  revalidateTag(TEMPLATES_TAG, { expire: 0 });
  revalidatePath("/templates");
  revalidatePath("/doraadmin/templates");
  revalidatePath(`/template/dieline/${slug}`);
};

/** Save the 3D picture a template shows in the template list. Multipart fields: "slug", "file" (PNG, 10 MB max). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  if (!(await adminId(request))) return fail(403, "Super admin only.");

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Content-Length is required.");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "File is larger than 10 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }
  const slug = form.get("slug");
  const file = form.get("file");
  if (typeof slug !== "string" || slug.length < 2 || slug.length > 80) return fail(400, "Invalid template.");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No file uploaded.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, "File is larger than 10 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type || type.mime !== "image/png") return fail(415, "The product image must be a PNG.");
  const problem = imageSizeProblem(imageSize(bytes, type.mime));
  if (problem) return fail(422, `This image cannot be used: ${problem}.`);

  const t = await db.template.findUnique({ where: { id: slug }, select: { productImageKey: true } });
  if (!t) return fail(404, "Template not found.");

  const key = `templates/${randomUUID()}.png`;
  try {
    await storage.put(key, bytes);
  } catch {
    return fail(500, "Could not store the file.");
  }
  try {
    await db.template.update({ where: { id: slug }, data: { productImageKey: key } });
  } catch {
    await storage.delete(key);
    return fail(500, "Could not save the template.");
  }
  if (t.productImageKey) await storage.delete(t.productImageKey).catch(() => undefined);
  refresh(slug);
  return NextResponse.json({ ok: true, url: `/api/templates/${slug}/product-image?v=${key.slice("templates/".length, -4)}` }, { status: 201 });
}

/** Remove a template's product image. Query: ?slug= */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  if (!(await adminId(request))) return fail(403, "Super admin only.");
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (slug.length < 2 || slug.length > 80) return fail(400, "Invalid template.");
  const t = await db.template.findUnique({ where: { id: slug }, select: { productImageKey: true } });
  if (!t) return fail(404, "Template not found.");
  await db.template.update({ where: { id: slug }, data: { productImageKey: null } });
  if (t.productImageKey) await storage.delete(t.productImageKey).catch(() => undefined);
  refresh(slug);
  return NextResponse.json({ ok: true });
}
