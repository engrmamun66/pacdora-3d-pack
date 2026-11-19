import "server-only";

import { sniffImage } from "@/lib/image-sniff";
import { readViewSettings, type ViewSettings } from "@/lib/view-settings";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene/images";
import { parseProjectDoc } from "@packaging/schema";
import { db } from "./db";

/** Most 3D pictures one project keeps, and the biggest one (a PNG at card size is far smaller). */
export const MAX_CAPTURES = 12;
export const MAX_CAPTURE_BYTES = 3 * 1024 * 1024;

/**
 * Where a 3D picture is served. The owner sees every one; anyone sees the cover one (it is on the shared pages).
 * The address carries a short version taken from the file name, so a picture that was updated is fetched again, not read from a cache.
 */
export const captureUrl = (id: string, storageKey: string) => `/api/captures/${id}?v=${storageKey.replace(/^captures\//, "").slice(0, 8)}`;

export interface CaptureInfo {
  id: string;
  url: string;
  layoutName: string | null;
  progress: number;
  /** The camera it was taken with (zoom included), to put back; null for older pictures. */
  view: ViewSettings | null;
  cover: boolean;
}

/** Run a route handler; an unexpected error is logged and answered as JSON (with the reason outside production), never as an empty 500. */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    console.error("[captures]", e);
    const why = process.env.NODE_ENV === "production" || !(e instanceof Error) ? "" : ` (${e.message.split("\n").pop()?.slice(0, 160)})`;
    return Response.json({ error: `The picture could not be saved on the server${why}.` }, { status: 500 });
  }
}

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

/** What a request that keeps or updates a picture carries, checked: the PNG, the layout name, the fold amount and the camera. */
export interface CaptureForm {
  bytes: Uint8Array;
  layoutName: string | null;
  progress: number;
  view: ViewSettings | null;
}

/** Read and check the multipart body of a capture request ("file", and optional "layoutName", "progress", "view"). */
export async function readCaptureForm(request: Request): Promise<CaptureForm | Response> {
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
  // The camera (zoom, turn, tilt, pan) it was taken with; a damaged value is just left out.
  let view: ViewSettings | null = null;
  const viewRaw = form.get("view");
  if (typeof viewRaw === "string" && viewRaw.length < 2000) {
    try {
      view = readViewSettings(JSON.parse(viewRaw));
    } catch {
      view = null;
    }
  }
  return { bytes, layoutName, progress, view };
}

/**
 * The design a project has now, kept with a 3D picture so a shared page can show that sample as it was designed (box size, windows,
 * artwork, backgrounds, colours). Read from the saved project on the server, so it is never taken on the client's word. Null when the
 * project file cannot be read.
 */
export async function captureDesign(projectId: string, userId: string): Promise<object | null> {
  const row = await db.project.findFirst({ where: { id: projectId, userId }, select: { projectData: true } });
  if (!row) return null;
  try {
    const doc = parseProjectDoc(row.projectData);
    return { params: doc.template.params, windows: doc.windows ?? [], artwork: doc.artwork, threeD: doc.threeD };
  } catch {
    return null;
  }
}
