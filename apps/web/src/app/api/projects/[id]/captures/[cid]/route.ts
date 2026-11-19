import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { storage } from "@/server/storage";
import { guarded } from "@/server/captures";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Make this picture the cover of the project (the one on the cards of the shared pages). */
export function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  return guarded(() => cover(request, ctx));
}

async function cover(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const { id, cid } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  const found = await db.projectCapture.findFirst({ where: { id: cid, projectId: id, userId }, select: { id: true } });
  if (!found) return fail(404, "Picture not found.");
  await db.$transaction([
    db.projectCapture.updateMany({ where: { projectId: id, userId, cover: true }, data: { cover: false } }),
    db.projectCapture.update({ where: { id: cid }, data: { cover: true } }),
  ]);
  return NextResponse.json({ ok: true });
}

/** Delete a picture (the row and the file). If it was the cover, the newest one left becomes the cover. */
export function DELETE(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  return guarded(() => remove(request, ctx));
}

async function remove(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const { id, cid } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  const row = await db.projectCapture.findFirst({ where: { id: cid, projectId: id, userId }, select: { id: true, storageKey: true, cover: true } });
  if (!row) return fail(404, "Picture not found.");
  await db.$transaction(async (tx) => {
    await tx.projectCapture.delete({ where: { id: row.id } });
    if (row.cover) {
      const next = await tx.projectCapture.findFirst({ where: { projectId: id, userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (next) await tx.projectCapture.update({ where: { id: next.id }, data: { cover: true } });
    }
  });
  await storage.delete(row.storageKey).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
