import { NextResponse } from "next/server";
import { z } from "zod";
import { dielineToDxf, sceneToSvg } from "@packaging/vector-scene";
import { getProfile, sceneToEps, sceneToPdf } from "@packaging/render-print";
import { auth } from "@/server/auth";
import { fileBase, projectScene } from "@/server/export";
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
  const { id } = await ctx.params;
  const project = await getProject(session.user.id, id);
  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!project.doc) return NextResponse.json({ error: "Project file is unreadable." }, { status: 422 });

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid export options." }, { status: 400 });
  const q = parsed.data;
  const base = fileBase(project.name);

  let body: string | Uint8Array;
  let type: string;
  let ext: string;
  let losses: readonly string[] = [];
  try {
    if (q.format === "json") {
      body = JSON.stringify(project.doc, null, 2);
      type = "application/json";
      ext = "json";
    } else {
      const { scene, geo } = await projectScene(session.user.id, project.doc, {
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
        if (!profile) return NextResponse.json({ error: "Unknown Illustrator version." }, { status: 400 });
        const untested = q.format === "pdf" ? [] : [`${profile.label} profile is untested: it has not been opened in that Illustrator version yet.`];
        if (q.format === "eps") {
          const r = sceneToEps(scene, { psLevel: profile.eps.psLevel, title: project.name });
          body = r.bytes;
          type = "application/postscript";
          ext = "eps";
          losses = [...scene.losses, ...r.losses, ...untested];
        } else {
          const settings = q.format === "pdf" ? ({ pdfVersion: "1.7", layers: true, transparency: "live" } as const) : profile.ai;
          if (!settings) return NextResponse.json({ error: `${profile.label} .ai files are PostScript-based; use EPS for this version.` }, { status: 400 });
          const r = await sceneToPdf(scene, { ...settings, title: project.name });
          body = r.bytes;
          type = q.format === "pdf" ? "application/pdf" : "application/illustrator";
          ext = q.format;
          losses = [...scene.losses, ...r.losses, ...untested];
        }
      } else if (q.format === "dxf") {
        body = dielineToDxf(geo);
        type = "application/dxf";
        ext = "dxf";
        losses = q.artwork && project.doc.artwork.objects.length ? ["DXF contains the die lines only (cut and crease); artwork is not included."] : [];
      } else {
        body = sceneToSvg(scene);
        type = "image/svg+xml";
        ext = "svg";
        losses = [...scene.losses, ...(q.dieline ? ["SVG has no spot colours: die lines use their preview colours."] : [])];
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `Export failed: ${(e as Error).message}` }, { status: 500 });
  }

  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${base}.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Report": encodeURIComponent(JSON.stringify({ format: q.format, profile: q.format === "ai" || q.format === "eps" ? q.profile : null, losses })),
    },
  });
}
