import { NextResponse } from "next/server";
import { isSameOrigin } from "@/server/same-origin";
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

/**
 * Delete one of the signed-in user's own pictures (the database row and the file). Refused while a project of theirs still uses it,
 * because that project would lose the picture and could not be saved any more.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const userId = session.user.id;
  const asset = await db.asset.findFirst({ where: { id, userId } });
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const using = await db.$queryRaw<{ name: string }[]>`select name from project where "userId" = ${userId} and "projectData"::text like ${`%${id}%`} limit 5`;
  if (using.length) {
    const names = using.map((p) => `"${p.name}"`).join(", ");
    return NextResponse.json({ error: `This picture is used in ${names}. Remove it there first.`, projects: using.map((p) => p.name) }, { status: 409 });
  }
  await db.asset.delete({ where: { id: asset.id } });
  await storage.delete(asset.storageKey).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
