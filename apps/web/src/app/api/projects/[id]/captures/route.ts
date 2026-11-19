import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOrigin } from "@/server/same-origin";
import { LIMITS, takeToken } from "@/server/limits";
import { storage } from "@/server/storage";
import { MAX_CAPTURES, MAX_CAPTURE_BYTES, captureUrl, guarded, type CaptureInfo } from "@/server/captures";
import { sniffImage } from "@/lib/image-sniff";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** The 3D pictures of one of the signed-in user's projects, newest first. */
export function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  return guarded(() => list(request, ctx));
}

async function list(request: Request, ctx: RouteContext<"/api/projects/[id]/captures">) {
  const { id } = await ctx.params;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please sign in.");
  const rows = await db.projectCapture.findMany({ where: { projectId: id, userId: session.user.id }, orderBy: { createdAt: "desc" }, select: { id: true, layoutName: true, progress: true, cover: true } });
  const captures: CaptureInfo[] = rows.map((r) => ({ ...r, url: captureUrl(r.id) }));
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

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Content-Length is required.");
  if (declared > MAX_CAPTURE_BYTES + 64 * 1024) return fail(413, "The picture is too large.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No picture received.");
  if (file.size > MAX_CAPTURE_BYTES) return fail(413, "The picture is too large.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (type?.mime !== "image/png") return fail(415, "Only PNG pictures are accepted.");
  const problem = imageSizeProblem(imageSize(bytes, type.mime));
  if (problem) return fail(422, `This picture cannot be used: ${problem}.`);

  const layoutRaw = form.get("layoutName");
  const layoutName = typeof layoutRaw === "string" && layoutRaw.trim() ? layoutRaw.trim().slice(0, 40) : null;
  const progressRaw = Number(form.get("progress"));
  const progress = Number.isFinite(progressRaw) ? Math.min(1, Math.max(0, progressRaw)) : 1;

  const storageKey = `captures/${randomUUID()}.png`;
  const row = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`capture:${id}`}, 0))`;
    const count = await tx.projectCapture.count({ where: { projectId: id } });
    if (count >= MAX_CAPTURES) return null;
    return tx.projectCapture.create({
      data: { projectId: id, userId, storageKey, sizeBytes: bytes.length, layoutName, progress, cover: count === 0 },
      select: { id: true, layoutName: true, progress: true, cover: true },
    });
  });
  if (!row) return fail(409, `At most ${MAX_CAPTURES} pictures per project. Delete one first.`);
  try {
    await storage.put(storageKey, bytes);
  } catch {
    await db.projectCapture.deleteMany({ where: { storageKey } });
    return fail(500, "Could not store the picture.");
  }
  const capture: CaptureInfo = { ...row, url: captureUrl(row.id) };
  return NextResponse.json({ capture }, { status: 201 });
}
