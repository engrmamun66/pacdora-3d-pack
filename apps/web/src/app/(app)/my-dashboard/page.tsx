import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { loadMyDashboard } from "@/server/my-templates";
import { ButtonLink } from "@/components/button-link";
import { ManagePanel } from "@/components/my-dashboard/manage-panel";
import { dashHref } from "@/lib/dash-href";
import { TemplateCard } from "@/components/my-dashboard/template-card";
import { AddSystemDialog } from "@/components/my-dashboard/add-system-dialog";

export const metadata = { title: "My dashboard" };

async function Dashboard({ searchParams }: { searchParams: PageProps<"/my-dashboard">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filter = { q: str("q").trim().slice(0, 100), cat: str("cat").slice(0, 60), tag: str("tag").slice(0, 60) };
  const data = await loadMyDashboard(user.id, filter);
  const filtered = Boolean(filter.q || filter.cat || filter.tag);
  const activeCat = data.categories.find((c) => c.id === filter.cat)?.name ?? (filter.cat === "none" ? "No category" : null);
  const activeTag = data.tags.find((t) => t.id === filter.tag)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My dashboard</h1>
          <p className="text-muted-foreground">Welcome, {user.name.split(" ")[0]}. Your templates, with your own categories and tags.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddSystemDialog categories={data.categories} />
          <ButtonLink href="/templates">Browse all templates</ButtonLink>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ManagePanel filter={filter} total={data.total} uncategorised={data.uncategorised} categories={data.categories} tags={data.tags} />

        <section className="flex min-w-0 flex-col gap-4" aria-label="My templates">
          <form className="flex flex-wrap items-center gap-2" role="search" action="/my-dashboard">
            {filter.cat ? <input type="hidden" name="cat" value={filter.cat} /> : null}
            {filter.tag ? <input type="hidden" name="tag" value={filter.tag} /> : null}
            <label className="sr-only" htmlFor="my-q">Search my templates</label>
            <input id="my-q" name="q" defaultValue={filter.q} maxLength={100} placeholder="Search my templates" className="h-9 w-64 rounded-lg border border-input bg-background px-2.5 text-sm" />
            <button type="submit" className="h-9 rounded-lg border bg-background px-3 text-sm hover:bg-muted">Search</button>
            {filtered ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {activeCat ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Category: {activeCat}</span> : null}
                {activeTag ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Tag: {activeTag}</span> : null}
                <Link href={dashHref({ q: "", cat: "", tag: "" })} className="underline underline-offset-4 hover:text-foreground">Clear</Link>
              </span>
            ) : null}
          </form>

          {data.total === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
              <p className="text-muted-foreground">You have no templates yet. Add one from the system templates, or open a template to start a project.</p>
            </div>
          ) : data.templates.length === 0 ? (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">No templates match.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.templates.map((t) => <TemplateCard key={t.id} t={t} categories={data.categories} tags={data.tags} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function MyDashboardPage({ searchParams }: PageProps<"/my-dashboard">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
