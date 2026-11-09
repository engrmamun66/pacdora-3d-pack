import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { listProjects } from "@/server/projects";
import { projectThumbnail } from "@/lib/dieline-preview";
import { ButtonLink } from "@/components/button-link";

export const metadata = { title: "Dashboard" };

async function Overview() {
  const user = await requireUser();
  const recent = (await listProjects(user.id)).slice(0, 4);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">Start from a template or continue a project.</p>
        </div>
        <ButtonLink href="/templates">New project</ButtonLink>
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent projects</h2>
          {recent.length > 0 ? <Link href="/projects" className="text-sm text-muted-foreground hover:underline">All projects</Link> : null}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet. Pick a template to create your first dieline.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((p) => {
              const thumb = p.doc ? projectThumbnail(p.template, p.doc.template.generatorId, p.doc.template.params) : null;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border transition hover:shadow-sm">
                    <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL */}
                      {thumb ? <img src={thumb} alt="" className="max-h-full max-w-full" /> : null}
                    </div>
                    <p className="truncate p-3 text-sm font-medium">{p.name}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
      <Overview />
    </Suspense>
  );
}
