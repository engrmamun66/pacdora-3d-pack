import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { isHash } from "@/server/share-hash";
import { storage } from "@/server/storage";

/** The business logo of a Client, by their user hash. Public: it is shown on their shared pages. */
export async function GET(_request: Request, ctx: RouteContext<"/api/portal/logo/[userHash]">) {
  const { userHash } = await ctx.params;
  if (!isHash(userHash)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const link = await db.shareLink.findUnique({ where: { hash: userHash }, select: { scope: true, user: { select: { banned: true, businessLogoKey: true, businessLogoMime: true } } } });
  const u = link?.scope === "all" ? link.user : null;
  if (!u || u.banned || !u.businessLogoKey || !u.businessLogoMime) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(u.businessLogoKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": u.businessLogoMime,
      "Content-Length": String(bytes.length),
      // The address carries the file's own id, so a new logo has a new address.
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
