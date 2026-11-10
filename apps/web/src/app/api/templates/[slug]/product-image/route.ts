import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/**
 * The 3D picture of a template, for the template list (signed-in users, like the template pages).
 * Unpublished templates are visible to super admins only. The URL carries ?v=<file id>, so the
 * file can be cached for good.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/templates/[slug]/product-image">) {
  const { slug } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (slug.length > 80) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const t = await db.template.findUnique({ where: { id: slug }, select: { published: true, productImageKey: true } });
  if (!t?.productImageKey) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!t.published) {
    const u = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, banned: true } });
    if (u?.role !== "superadmin" || u.banned) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const bytes = await storage.get(t.productImageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
