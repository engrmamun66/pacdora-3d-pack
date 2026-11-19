import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { storage } from "@/server/storage";
import { randomUUID } from "node:crypto";
import { LIMITS, takeToken } from "@/server/limits";
import { captureUrl, guarded, readCaptureForm, type CaptureInfo } from "@/server/captures";
import { readViewSettings } from "@/lib/view-settings";

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

/** Update a picture: a new PNG with the layout, fold amount and camera it was taken with. It keeps its place and its cover mark. */
export function PUT(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  return guarded(() => update(request, ctx));
}

async function update(request: Request, ctx: RouteContext<"/api/projects/[id]/captures/[cid]">) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const { id, cid } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  if (!(await takeToken(userId, "upload", LIMITS.upload.max, LIMITS.upload.windowSec))) return fail(429, "Too many uploads. Please wait a minute.");
  const old = await db.projectCapture.findFirst({ where: { id: cid, projectId: id, userId }, select: { storageKey: true } });
  if (!old) return fail(404, "Picture not found.");
  const form = await readCaptureForm(request);
  if (form instanceof Response) return form;

  const storageKey = `captures/${randomUUID()}.png`;
  await storage.put(storageKey, form.bytes);
  let row;
  try {
    row = await db.projectCapture.update({
      where: { id: cid },
      data: { storageKey, sizeBytes: form.bytes.length, layoutName: form.layoutName, progress: form.progress, view: form.view ?? Prisma.DbNull },
      select: { id: true, layoutName: true, progress: true, view: true, cover: true },
    });
  } catch (e) {
    await storage.delete(storageKey).catch(() => undefined);
    throw e;
  }
  await storage.delete(old.storageKey).catch(() => undefined);
  const capture: CaptureInfo = { ...row, view: readViewSettings(row.view), url: captureUrl(row.id, storageKey) };
  return NextResponse.json({ capture });
}
