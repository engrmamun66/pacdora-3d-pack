import { NextResponse } from "next/server";
import { isBackgroundCategory } from "@/lib/artwork-meta";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** A featured background picture, for the shared template pages (no sign-in: customers see it). Only pictures the admin featured are served. */
export async function GET(_request: Request, ctx: RouteContext<"/api/portal/backgrounds/[id]">) {
  const { id } = await ctx.params;
  if (!/^[\w-]{1,60}$/.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await db.artworkItem.findUnique({ where: { id }, select: { storageKey: true, mime: true, featured: true, category: true } });
  if (!row || !row.featured || !isBackgroundCategory(row.category)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(row.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.length),
      // A picture never changes under its id; if it is un-featured the address stops working after the cache runs out.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
