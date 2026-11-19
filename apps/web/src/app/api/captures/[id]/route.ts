import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** A 3D picture of a project: the owner can see all of theirs; anyone can see the cover one (it is on the shared pages). */
export async function GET(request: Request, ctx: RouteContext<"/api/captures/[id]">) {
  const { id } = await ctx.params;
  const row = await db.projectCapture.findUnique({ where: { id }, select: { storageKey: true, cover: true, userId: true, projectId: true } });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // The cover is on the shared pages. The other pictures are the design samples of a template the Client shares: shown while the template is not switched off.
  let isPublic = row.cover;
  if (!isPublic) {
    const [all, off] = await Promise.all([
      db.shareLink.findFirst({ where: { userId: row.userId, scope: "all", active: true }, select: { id: true } }),
      db.shareLink.findFirst({ where: { userId: row.userId, scope: "template", projectId: row.projectId, active: false }, select: { id: true } }),
    ]);
    isPublic = Boolean(all) && !off;
  }
  if (!isPublic) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user.id !== row.userId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const bytes = await storage.get(row.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      // The cover can change, so it is not cached for long; other pictures never change.
      "Cache-Control": isPublic ? "public, max-age=300" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
