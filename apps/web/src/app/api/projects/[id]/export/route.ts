import { NextResponse } from "next/server";
import { z } from "zod";
import type { ProjectDoc } from "@packaging/schema";
import { dielineToDxf, sceneToSvg } from "@packaging/vector-scene";
import { getProfile, sceneToEps, sceneToPdf } from "@packaging/render-print";
import { auth } from "@/server/auth";
import { fileBase, projectScene } from "@/server/export";
import { LIMITS, takeToken, withExportSlot } from "@/server/limits";
import { getProject } from "@/server/projects";

const flag = z.enum(["0", "1"]).transform((v) => v === "1");
const query = z.object({
  format: z.enum(["pdf", "ai", "eps", "svg", "dxf", "json"]),
  /** Illustrator target for ai/eps. */
  profile: z.string().max(10).default("cc"),
  artwork: flag.default(true),
  dieline: flag.default(true),
  bleed: flag.default(false),
  safe: flag.default(false),
  glue: flag.default(false),
  dimensions: flag.default(false),
  cutSpot: z.string().regex(/^[\w .-]{1,40}$/).default("CutContour"),
  creaseSpot: z.string().regex(/^[\w .-]{1,40}$/).default("Crease"),
});

/**
 * Download a project export. The response carries a JSON report header
 * (X-Export-Report, URI-encoded) listing anything the format could not represent.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/export">) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await takeToken(session.user.id, "export", LIMITS.export.max, LIMITS.export.windowSec))) {
    return NextResponse.json({ error: "Too many exports. Please wait a minute." }, { status: 429, headers: { "Retry-After": "30" } });
  }
  const { id } = await ctx.params;
  const project = await getProject(session.user.id, id);
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!project.doc) return NextResponse.json({ error: "Project file is unreadable." }, { status: 422 });

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid export options." }, { status: 400 });
  const q = parsed.data;
  const base = fileBase(project.name);

  const requestId = Math.random().toString(36).slice(2, 10);
  let out: Generated | "busy";
  try {
    out = await withExportSlot(() => generate(q, session.user.id, project.name, project.doc!));
  } catch (e) {
    // Details stay in the server log (they can contain paths and library internals).
    console.error(`[export ${requestId}] failed`, e);
    return NextResponse.json({ error: `Export failed. Reference ${requestId}.` }, { status: 500 });
  }
  if (out === "busy") return NextResponse.json({ error: "The server is busy exporting. Please try again in a moment." }, { status: 503, headers: { "Retry-After": "5" } });
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

  return new Response(typeof out.body === "string" ? out.body : new Uint8Array(out.body), {
    headers: {
      "Content-Type": out.type,
      "Content-Disposition": `attachment; filename="${base}.${out.ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Report": reportHeader({ format: q.format, profile: q.format === "ai" || q.format === "eps" ? q.profile : null, losses: out.losses }),
    },
  });
}

type Query = z.infer<typeof query>;
type Generated = { body: string | Uint8Array; type: string; ext: string; losses: readonly string[] } | { error: string; status: number };

/** Report header: at most 15 notes of 200 characters, and about 4 KB in total (proxies reject large headers). */
function reportHeader(r: { format: string; profile: string | null; losses: readonly string[] }): string {
  const notes = r.losses.slice(0, 15).map((l) => (l.length > 200 ? `${l.slice(0, 197)}...` : l));
  if (r.losses.length > 15) notes.push(`and ${r.losses.length - 15} more`);
  let enc = encodeURIComponent(JSON.stringify({ ...r, losses: notes }));
  while (enc.length > 4000 && notes.length > 1) {
    notes.splice(notes.length - 2, 1);
    enc = encodeURIComponent(JSON.stringify({ ...r, losses: notes }));
  }
  return enc.length > 4000 ? encodeURIComponent(JSON.stringify({ format: r.format, profile: r.profile, losses: ["Details omitted: too many notes."] })) : enc;
}

async function generate(q: Query, userId: string, name: string, doc: ProjectDoc): Promise<Generated> {
  if (q.format === "json") return { body: JSON.stringify(doc, null, 2), type: "application/json", ext: "json", losses: [] };
  const { scene, geo } = await projectScene(userId, doc, {
    artwork: q.artwork,
    dieline: q.dieline,
    bleedGuide: q.bleed,
    safeGuide: q.safe,
    glueAreas: q.glue,
    dimensions: q.dimensions,
    cutSpot: q.cutSpot,
    creaseSpot: q.creaseSpot,
  });
  if (q.format === "pdf" || q.format === "ai" || q.format === "eps") {
    const profile = getProfile(q.profile);
    if (!profile) return { error: "Unknown Illustrator version.", status: 400 };
    const untested = q.format === "pdf" ? [] : [`${profile.label} profile is untested: it has not been opened in that Illustrator version yet.`];
    if (q.format === "eps") {
      const r = sceneToEps(scene, { psLevel: profile.eps.psLevel, title: name });
      return { body: r.bytes, type: "application/postscript", ext: "eps", losses: [...scene.losses, ...r.losses, ...untested] };
    }
    const settings = q.format === "pdf" ? ({ pdfVersion: "1.7", layers: true, transparency: "live" } as const) : profile.ai;
    if (!settings) return { error: `${profile.label} .ai files are PostScript-based; use EPS for this version.`, status: 400 };
    const r = await sceneToPdf(scene, { ...settings, title: name });
    return { body: r.bytes, type: q.format === "pdf" ? "application/pdf" : "application/illustrator", ext: q.format, losses: [...scene.losses, ...r.losses, ...untested] };
  }
  if (q.format === "dxf") {
    const note = q.artwork && doc.artwork.objects.length ? ["DXF contains the die lines only (cut and crease); artwork is not included."] : [];
    return { body: dielineToDxf(geo), type: "application/dxf", ext: "dxf", losses: note };
  }
  return { body: sceneToSvg(scene), type: "image/svg+xml", ext: "svg", losses: [...scene.losses, ...(q.dieline ? ["SVG has no spot colours: die lines use their preview colours."] : [])] };
}
