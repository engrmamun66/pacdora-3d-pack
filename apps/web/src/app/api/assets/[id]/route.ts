import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** Serve an uploaded image to its owner only. */
export async function GET(request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const asset = await db.asset.findFirst({ where: { id, userId: session.user.id } });
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(asset.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": asset.fileType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
