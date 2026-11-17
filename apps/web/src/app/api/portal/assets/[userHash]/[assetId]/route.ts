import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { findOwner, portalAssetAllowed } from "@/server/portal";
import { storage } from "@/server/storage";

/** A picture used by a template a Client shares, for the 3D view on the shared page. Public, but only for pictures of templates that are on. */
export async function GET(_request: Request, ctx: RouteContext<"/api/portal/assets/[userHash]/[assetId]">) {
  const { userHash, assetId } = await ctx.params;
  const owner = await findOwner(userHash);
  if (!owner || !owner.allActive) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await portalAssetAllowed(owner, assetId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const asset = await db.asset.findFirst({ where: { id: assetId, userId: owner.userId } });
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await storage.get(asset.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": asset.fileType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
