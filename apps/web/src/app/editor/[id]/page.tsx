import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db";
import { getProject } from "@/server/projects";
import { requireUser } from "@/server/session";
import { SessionGuardHost } from "@/components/auth/session-guard-host";
import { EditorLoader } from "@/components/editor/editor-loader";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import { IMPORTED_GENERATOR_ID, type WindowSpec } from "@packaging/dieline-engine";
import { loadImportedSource } from "@/server/imported-templates";
import { readViewSettings } from "@/lib/view-settings";
import { getWatermark } from "@/server/site-settings";
import { listLayouts } from "@/server/layouts";
import { ensureLinks } from "@/server/portal";
import { templateHash } from "@/server/share-hash";
import { portalTemplate } from "@/lib/portal-paths";

/** Tab title "<site name> | Online design": the site name is added by the root layout template. */
export const metadata: Metadata = { title: "Online design" };

async function EditorView({ params, searchParams }: { params: PageProps<"/editor/[id]">["params"]; searchParams: PageProps<"/editor/[id]">["searchParams"] }) {
  const { id } = await params;
  // ?embed=1: the page is shown inside a box of another page (the layout designs of the admin): no way out of it.
  const embedded = (await searchParams).embed === "1";
  const user = await requireUser();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  if (!project.doc) return <p className="p-8 text-destructive">This project file could not be read.</p>;
  const assets = await db.asset.findMany({
    // Library copies (storage key "<user>/lib-...") are not uploads: they are made when a library picture is used.
    where: { userId: user.id, NOT: { storageKey: { contains: "/lib-" } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true },
    take: 200,
  });
  const library = await db.artworkItem.findMany({
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, tags: true, category: true },
    take: 1000,
  });
  const favorites = await db.artworkFavorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { artworkId: true } });
  const imported = project.doc.template.generatorId === IMPORTED_GENERATOR_ID ? await loadImportedSource(project.doc.template.presetId) : null;
  if (project.doc.template.generatorId === IMPORTED_GENERATOR_ID && !imported) {
    return <p className="p-8 text-destructive">The template this project was made from is no longer available.</p>;
  }
  // The address of this template on the Client's shared pages, for the Link button.
  await ensureLinks(user.id);
  const [allLink, offLink] = await Promise.all([
    db.shareLink.findFirst({ where: { userId: user.id, scope: "all" }, select: { hash: true, active: true } }),
    db.shareLink.findFirst({ where: { userId: user.id, scope: "template", projectId: project.id, active: false }, select: { id: true } }),
  ]);
  return (
    <>
    <SessionGuardHost email={user.email} />
    <EditorLoader
      projectId={project.id}
      embedded={embedded}
      viewer={{ name: user.name, email: user.email, image: user.image ?? null }}
      name={project.name}
      generatorId={project.doc.template.generatorId}
      {...(imported ? { imported: { templateId: imported.templateId, flat: imported.flat, fold: imported.fold } } : {})}
      initialView={readViewSettings(project.template.viewSettings)}
      params={project.doc.template.params}
      windows={(project.doc.windows ?? []) as WindowSpec[]}
      artwork={project.doc.artwork}
      assets={assets}
      library={library}
      favoriteIds={favorites.map((f) => f.artworkId)}
      threeD={project.doc.threeD}
      watermark={await getWatermark(user)}
      layouts={await listLayouts(true)}
      previewLink={allLink && !embedded ? { path: portalTemplate(allLink.hash, null, templateHash(project.id)), active: allLink.active && !offLink } : null}
    />
    </>
  );
}

export default function EditorPage({ params, searchParams }: PageProps<"/editor/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
