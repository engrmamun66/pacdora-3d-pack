import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { getProject } from "@/server/projects";
import { DielineWorkspace } from "@/components/dielines/workspace";
import { IMPORTED_GENERATOR_ID } from "@packaging/dieline-engine";
import { loadImportedSource } from "@/server/imported-templates";
import { readViewSettings } from "@/lib/view-settings";

async function ProjectView({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  if (!project.doc) {
    return <p className="p-6 text-destructive">This project file could not be read. It may come from a newer version of the app.</p>;
  }
  const imported = project.doc.template.generatorId === IMPORTED_GENERATOR_ID ? await loadImportedSource(project.doc.template.presetId) : null;
  if (project.doc.template.generatorId === IMPORTED_GENERATOR_ID && !imported) {
    return <p className="p-6 text-destructive">The template this project was made from is no longer available.</p>;
  }
  return (
    <DielineWorkspace
      mode={{ kind: "edit", projectId: project.id }}
      generatorId={project.doc.template.generatorId}
      {...(imported ? { imported: { templateId: imported.templateId, flat: imported.flat, fold: imported.fold } } : {})}
      initialView={readViewSettings(project.template.viewSettings)}
      title={project.name}
      description={`Last saved ${project.updatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`}
      initialName={project.name}
      initialParams={project.doc.template.params}
    />
  );
}

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-muted" />}>
      <ProjectView params={params} />
    </Suspense>
  );
}
