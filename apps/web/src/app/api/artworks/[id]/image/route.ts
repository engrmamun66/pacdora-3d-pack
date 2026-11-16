import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** An artwork-library picture, for signed-in users (the library is shared by all customers). The file never changes, so it can be cached for good. */
export async function GET(request: Request, ctx: RouteContext<"/api/artworks/[id]/image">) {
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (id.length > 60) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await db.artworkItem.findUnique({ where: { id }, select: { storageKey: true, mime: true } });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(row.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
