import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** A 3D picture of a project: the owner can see all of theirs; anyone can see the cover one (it is on the shared pages). */
export async function GET(request: Request, ctx: RouteContext<"/api/captures/[id]">) {
  const { id } = await ctx.params;
  const row = await db.projectCapture.findUnique({ where: { id }, select: { storageKey: true, cover: true, userId: true } });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!row.cover) {
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
      "Cache-Control": row.cover ? "public, max-age=300" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
