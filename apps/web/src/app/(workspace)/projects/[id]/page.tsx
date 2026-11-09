import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { getProject } from "@/server/projects";
import { DielineWorkspace } from "@/components/dielines/workspace";

async function ProjectView({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  if (!project.doc) {
    return <p className="p-6 text-destructive">This project file could not be read. It may come from a newer version of the app.</p>;
  }
  return (
    <DielineWorkspace
      mode={{ kind: "edit", projectId: project.id }}
      generatorId={project.doc.template.generatorId}
      title={project.name}
      description={`Last saved ${project.updatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`}
      initialName={project.name}
      initialParams={project.doc.template.params}
      backHref="/projects"
      backLabel="Projects"
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
