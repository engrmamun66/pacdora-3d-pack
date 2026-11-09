import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { listProjects } from "@/server/projects";
import { projectThumbnail } from "@/lib/dieline-preview";
import { ButtonLink } from "@/components/button-link";

export const metadata = { title: "Projects" };

async function ProjectList() {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
        <p className="text-muted-foreground">No projects yet.</p>
        <ButtonLink href="/templates">Start from a template</ButtonLink>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const thumb = p.doc ? projectThumbnail(p.template, p.doc.template.generatorId, p.doc.template.params) : null;
        return (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border transition hover:shadow-sm">
              <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL */}
                {thumb ? <img src={thumb} alt="" className="max-h-full max-w-full" /> : <span className="text-xs text-muted-foreground">No preview</span>}
              </div>
              <div className="p-4">
                <h2 className="truncate font-medium">{p.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {p.template.name} · updated {p.updatedAt.toISOString().slice(0, 10)}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <ButtonLink href="/templates">New project</ButtonLink>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
        <ProjectList />
      </Suspense>
    </div>
  );
}
