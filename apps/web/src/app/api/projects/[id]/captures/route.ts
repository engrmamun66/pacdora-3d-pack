import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";
import { storage } from "@/server/storage";
import { MAX_CAPTURES, captureUrl, guarded, readCaptureForm, type CaptureInfo } from "@/server/captures";
import { readViewSettings } from "@/lib/view-settings";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** The 3D pictures of one of the signed-in user's projects, newest first. */
export function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  return guarded(() => list(request, ctx));
}

async function list(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const rows = await db.projectCapture.findMany({ where: { projectId: id, userId: session.user.id }, orderBy: { createdAt: "desc" }, select: { id: true, storageKey: true, layoutName: true, progress: true, view: true, cover: true } });
  const captures: CaptureInfo[] = rows.map(({ storageKey, ...r }) => ({ ...r, view: readViewSettings(r.view), url: captureUrl(r.id, storageKey) }));
  return NextResponse.json({ captures });
}

/** Keep a 3D picture (PNG) of the project. Multipart: "file", optional "layoutName" and "progress". The first one becomes the cover. */
export function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  return guarded(() => create(request, ctx));
}

async function create(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  if (!isSameOrigin(request)) return fail(403, "Cross-site request rejected.");
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const userId = session.user.id;
  if (!(await takeToken(userId, "upload", LIMITS.upload.max, LIMITS.upload.windowSec))) return fail(429, "Too many uploads. Please wait a minute.");
  const project = await db.project.findFirst({ where: { id, userId }, select: { id: true } });
  if (!project) return fail(404, "Project not found.");

  const form = await readCaptureForm(request);
  if (form instanceof Response) return form;
  const { bytes, layoutName, progress, view } = form;

  const storageKey = `captures/${randomUUID()}.png`;
  const row = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`capture:${id}`}, 0))`;
    const count = await tx.projectCapture.count({ where: { projectId: id } });
    if (count >= MAX_CAPTURES) return null;
    return tx.projectCapture.create({
      data: { projectId: id, userId, storageKey, sizeBytes: bytes.length, layoutName, progress, ...(view ? { view } : {}), cover: count === 0 },
      select: { id: true, layoutName: true, progress: true, view: true, cover: true },
    });
  });
  if (!row) return fail(409, `At most ${MAX_CAPTURES} pictures per project. Delete one first.`);
  try {
    await storage.put(storageKey, bytes);
  } catch {
    await db.projectCapture.deleteMany({ where: { storageKey } });
    return fail(500, "Could not store the picture.");
  }
  const capture: CaptureInfo = { ...row, view: readViewSettings(row.view), url: captureUrl(row.id, storageKey) };
  return NextResponse.json({ capture }, { status: 201 });
}
