import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { getProject } from "@/server/projects";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ButtonLink } from "@/components/button-link";

async function ProjectView({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  if (!project.doc) {
    return <p className="text-destructive">This project file could not be read. It may come from a newer version of the app.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-muted-foreground hover:underline">← Projects</Link>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-xs text-muted-foreground">Last saved {project.updatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href={`/editor/${project.id}`}>Edit artwork</ButtonLink>
          <DeleteProjectButton projectId={project.id} name={project.name} />
        </div>
      </div>
      <TemplateDesigner
        mode={{ kind: "edit", projectId: project.id }}
        generatorId={project.doc.template.generatorId}
        initialName={project.name}
        initialParams={project.doc.template.params}
      />
    </div>
  );
}

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
      <ProjectView params={params} />
    </Suspense>
  );
}
