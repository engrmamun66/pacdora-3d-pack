import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { storage } from "@/server/storage";
import { IDENTITY_FILES, parseSiteIdentity, type IdentityFile } from "@/lib/site-identity";

/**
 * The site logo or favicon. Public (the logo is on every page, the favicon is
 * fetched by the browser). The URL carries ?v=<file id>, so the file can be cached for good.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/site/[kind]">) {
  const { kind } = await ctx.params;
  if (!IDENTITY_FILES.includes(kind as IdentityFile)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await db.siteSetting.findUnique({ where: { key: "identity" }, select: { value: true } });
  const identity = row ? parseSiteIdentity(row.value) : null;
  const key = kind === "logo" ? identity?.logoKey : identity?.faviconKey;
  if (!key) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(key);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": key.endsWith(".png") ? "image/png" : "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
