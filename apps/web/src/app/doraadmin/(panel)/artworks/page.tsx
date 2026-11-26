import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { AddArtworkButton, ArtworkGrid } from "@/components/admin/artwork-manager";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Artworks" };

export default async function ArtworksPage({ searchParams }: PageProps<"/doraadmin/artworks">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const view = sp.view === "list" ? "list" : "gallery";
  const category = (typeof sp.category === "string" ? sp.category : "").trim().slice(0, 40);

  const [rows, groups] = await Promise.all([
    db.artworkItem.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }, { category: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, tags: true, category: true, widthPx: true, heightPx: true, sizeBytes: true, featured: true },
    }),
    db.artworkItem.groupBy({ by: ["category"], _count: { _all: true }, orderBy: { category: "asc" } }),
  ]);
  const categories = groups.filter((g) => g.category).map((g) => ({ name: g.category, count: g._count._all }));
  const total = groups.reduce((n, g) => n + g._count._all, 0);
  /** A link to this page with some filters changed; the gallery is the default view, so it is not written in the URL. */
  const href = (c: string, v: "gallery" | "list" = view) => {
    const qs = new URLSearchParams({ ...(c ? { category: c } : {}), ...(q ? { q } : {}), ...(v === "list" ? { view: "list" } : {}) }).toString();
    return `/doraadmin/artworks${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Artworks" description="Pictures clients can place on their design (PNG or JPEG, 10 MB max). Each one needs a name and tags; the category is optional and groups them in the artwork menu." actions={<AddArtworkButton categories={categories.map((c) => c.name)} />} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[208px_minmax(0,1fr)] md:items-start">
        <aside className="md:sticky md:top-24">
          <nav aria-label="Categories" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 shadow-xs md:max-h-[calc(100dvh-8rem)] md:flex-col md:overflow-x-visible md:overflow-y-auto">
            {[{ name: "", label: "All categories", count: total }, ...categories.map((c) => ({ name: c.name, label: c.name, count: c.count }))].map((c) => {
              const active = category === c.name;
              return (
                <Link
                  key={c.name || "all"}
                  href={href(c.name)}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                >
                  <span className="truncate">{c.label}</span>
                  <span className="text-xs tabular-nums opacity-70">{c.count}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <section aria-label="Library" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <form action="/doraadmin/artworks" className="flex flex-1 gap-2" role="search">
              {category ? <input type="hidden" name="category" value={category} /> : null}
              {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
              <input name="q" defaultValue={q} placeholder="Search name or tag" aria-label="Search artworks" maxLength={80} className="h-9 w-full max-w-72 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            </form>
            <div role="group" aria-label="View" className="flex overflow-hidden rounded-lg border">
              {([["gallery", "Gallery view", LayoutGrid], ["list", "List view", List]] as const).map(([v, label, Icon]) => (
                <Link key={v} href={href(category, v)} title={label} aria-label={label} aria-current={view === v ? "true" : undefined} className={`grid size-9 place-items-center ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  <Icon className="size-4" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
          <ArtworkGrid rows={rows} categories={categories.map((c) => c.name)} filtered={Boolean(q || category)} view={view} />
        </section>
      </div>
    </div>
  );
}

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
