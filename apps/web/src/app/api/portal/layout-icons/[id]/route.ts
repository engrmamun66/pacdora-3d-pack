import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** The icon of a layout (a small 3D picture). Public: it is shown on the shared template pages. */
export async function GET(_request: Request, ctx: RouteContext<"/api/portal/layout-icons/[id]">) {
  const { id } = await ctx.params;
  const row = await db.templateLayout.findUnique({ where: { id }, select: { iconKey: true } });
  const bytes = row?.iconKey ? await storage.get(row.iconKey) : null;
  if (!bytes) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      // The address carries a version that changes with the icon.
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
