import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db";
import { getProject } from "@/server/projects";
import { requireUser } from "@/server/session";
import { EditorLoader } from "@/components/editor/editor-loader";
import { IMPORTED_GENERATOR_ID, type WindowSpec } from "@packaging/dieline-engine";
import { loadImportedSource } from "@/server/imported-templates";
import { readViewSettings } from "@/lib/view-settings";
import { getWatermark } from "@/server/site-settings";

async function EditorView({ params }: { params: PageProps<"/editor/[id]">["params"] }) {
  const { id } = await params;
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
  return (
    <EditorLoader
      projectId={project.id}
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
    />
  );
}

export default function EditorPage({ params }: PageProps<"/editor/[id]">) {
  return (
    <Suspense fallback={<div className="h-screen animate-pulse bg-muted" />}>
      <EditorView params={params} />
    </Suspense>
  );
}
