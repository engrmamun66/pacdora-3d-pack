import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db";
import { getProject } from "@/server/projects";
import { requireUser } from "@/server/session";
import { EditorLoader } from "@/components/editor/editor-loader";

async function EditorView({ params }: { params: PageProps<"/editor/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  if (!project.doc) return <p className="p-8 text-destructive">This project file could not be read.</p>;
  const assets = await db.asset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true },
    take: 200,
  });
  return (
    <EditorLoader
      projectId={project.id}
      name={project.name}
      generatorId={project.doc.template.generatorId}
      params={project.doc.template.params}
      artwork={project.doc.artwork}
      assets={assets}
      threeD={project.doc.threeD}
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
