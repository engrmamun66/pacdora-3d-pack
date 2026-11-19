"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, List, Search, X } from "lucide-react";
import {
  deleteMyTemplate,
  setTemplateCategory,
  setTemplateTags,
  type MyResult,
} from "@/app/(dash)/my-dashboard/actions";
import { notify } from "@/lib/notify";
import { confirmAction } from "@/lib/confirm";
import type { MyDashboard, MyLabel, MyTemplateRow } from "@/server/my-templates";
import { AddSystemDialog } from "./add-system-dialog";
import { ManagePanel } from "./manage-panel";
import { TemplateItem } from "./template-item";

type Sort = "updated" | "oldest" | "name";
type View = "grid" | "list";
const SORTS: { value: Sort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

export interface DashboardInitial {
  q: string;
  cat: string;
  tag: string;
  sort: Sort;
  view: View;
}

const FAIL: MyResult = { ok: false, message: "Could not save. Please try again." };

/** What the server sent, as a short string: when it changes the browser's copy is replaced by it. */
const signature = (t: MyTemplateRow[], c: MyLabel[], g: MyLabel[]) =>
  `${t.map((x) => `${x.id}:${x.updatedMs}:${x.name}:${x.categoryId ?? ""}:${x.tagIds.join(",")}`).join("|")}#${c.map((x) => `${x.id}:${x.name}`).join("|")}#${g.map((x) => `${x.id}:${x.name}`).join("|")}`;

/**
 * The templates tab of the dashboard. The browser holds the customer's templates, so searching,
 * filtering and sorting answer at once; every change is shown immediately and saved in the
 * background (and put back with a message if saving fails).
 */
export function DashboardClient({ templates, categories, tags, total, share, initial }: { templates: MyTemplateRow[]; categories: MyLabel[]; tags: MyLabel[]; total: number; share: MyDashboard["share"]; initial: DashboardInitial }) {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState(templates);
  const [cats, setCats] = useState(categories);
  const [tagList, setTagList] = useState(tags);
  const sig = signature(templates, categories, tags);
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    // The server sent newer data (after a save, or adding a system template): use it.
    setSeen(sig);
    setItems(templates);
    setCats(categories);
    setTagList(tags);
  }
  const [q, setQ] = useState(initial.q);
  const [cat, setCat] = useState(initial.cat);
  const [tag, setTag] = useState(initial.tag);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [view, setView] = useState<View>(initial.view);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  // A category or tag that no longer exists (deleted, or an old link) filters nothing.
  const catFilter = cat === "none" || cats.some((c) => c.id === cat) ? cat : "";
  const tagFilter = tagList.some((t) => t.id === tag) ? tag : "";

  // Keep the address in step with the filters, so a reload or a shared link shows the same list.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const set = (k: string, v: string, def = "") => (v && v !== def ? p.set(k, v) : p.delete(k));
    set("q", q.trim());
    set("cat", catFilter);
    set("tag", tagFilter);
    set("sort", sort, "updated");
    set("view", view, "grid");
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", qs ? `${pathname}?${qs}` : pathname);
  }, [q, catFilter, tagFilter, sort, view, pathname]);

  const patch = (id: string, changes: Partial<MyTemplateRow>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...changes } : x)));
  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  /** Show the change now, save it, and put it back (with a message) if saving fails. */
  async function change(id: string, apply: () => void, undo: () => void, save: () => Promise<MyResult>, quiet = false) {
    apply();
    mark(id, true);
    const r = await save().catch(() => FAIL);
    mark(id, false);
    if (!r.ok) {
      undo();
      notify.error(r.message);
    } else if (!quiet) notify.success(r.message);
  }

  const onCategory = (t: MyTemplateRow, categoryId: string | null) => {
    const before = t.categoryId;
    if (before === categoryId) return;
    return change(t.id, () => patch(t.id, { categoryId }), () => patch(t.id, { categoryId: before }), () => setTemplateCategory(t.id, categoryId), true);
  };
  const onTags = (t: MyTemplateRow, tagIds: string[]) => {
    const before = t.tagIds;
    return change(t.id, () => patch(t.id, { tagIds }), () => patch(t.id, { tagIds: before }), () => setTemplateTags(t.id, tagIds), true);
  };
  const onDelete = async (t: MyTemplateRow) => {
    if (!(await confirmAction({ title: `Delete "${t.name}"?`, description: "This cannot be undone." }))) return;
    return change(t.id, () => setItems((l) => l.filter((x) => x.id !== t.id)), () => setItems((l) => (l.some((x) => x.id === t.id) ? l : [...l, t])), () => deleteMyTemplate(t.id));
  };

  // ---- what is shown
  const counts = useMemo(() => {
    const byCat = new Map<string, number>();
    const byTag = new Map<string, number>();
    let none = 0;
    for (const x of items) {
      if (x.categoryId) byCat.set(x.categoryId, (byCat.get(x.categoryId) ?? 0) + 1);
      else none++;
      for (const g of x.tagIds) byTag.set(g, (byTag.get(g) ?? 0) + 1);
    }
    return { byCat, byTag, none };
  }, [items]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = items.filter(
      (x) =>
        (!catFilter || (catFilter === "none" ? x.categoryId === null : x.categoryId === catFilter)) &&
        (!tagFilter || x.tagIds.includes(tagFilter)) &&
        words.every((w) => `${x.name} ${x.templateName}`.toLowerCase().includes(w)),
    );
    return list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.updatedMs - b.updatedMs : b.updatedMs - a.updatedMs));
  }, [items, q, catFilter, tagFilter, sort]);

  const filtered = Boolean(q.trim() || catFilter || tagFilter);
  const clear = () => {
    setQ("");
    setCat("");
    setTag("");
  };
  const catName = cats.find((c) => c.id === catFilter)?.name ?? (catFilter === "none" ? "No category" : null);
  const tagName = tagList.find((t) => t.id === tagFilter)?.name ?? null;
  const toggle = (v: View) => `grid size-9 place-items-center rounded-md ${view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <ManagePanel
        cat={catFilter}
        tag={tagFilter}
        onCat={setCat}
        onTag={setTag}
        total={items.length}
        uncategorised={counts.none}
        categories={cats.map((c) => ({ ...c, count: counts.byCat.get(c.id) ?? 0 }))}
        tags={tagList.map((t) => ({ ...t, count: counts.byTag.get(t.id) ?? 0 }))}
        share={share}
      />

      <section className="flex min-w-0 flex-col gap-4" aria-label="My templates">
        <div className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQ("");
              }}
              maxLength={100}
              placeholder="Search my templates"
              aria-label="Search my templates"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"><X className="size-3.5" aria-hidden /></button>
            ) : null}
          </div>
          <label className="sr-only" htmlFor="my-sort">Sort by</label>
          <select id="my-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div role="group" aria-label="Layout" className="ml-auto flex rounded-lg bg-muted p-0.5">
            <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" title="Grid view" onClick={() => setView("grid")} className={toggle("grid")}><LayoutGrid className="size-4" aria-hidden /></button>
            <button type="button" aria-pressed={view === "list"} aria-label="List view" title="List view" onClick={() => setView("list")} className={toggle("list")}><List className="size-4" aria-hidden /></button>
          </div>
        </div>

        <div className="flex min-h-6 flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span>{filtered ? `${shown.length} of ${items.length}` : `${items.length}`} {items.length === 1 ? "template" : "templates"}</span>
          {catName ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Category: {catName}</span> : null}
          {tagName ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Tag: {tagName}</span> : null}
          {filtered ? <button type="button" onClick={clear} className="text-xs underline underline-offset-4 hover:text-foreground">Clear filters</button> : null}
          {total > items.length && !filtered ? <span className="text-xs">Showing your latest {items.length} of {total}.</span> : null}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--crease)]/50 bg-card/60 p-8">
            <h2 className="font-medium">No templates yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">Add a system template to start your own list. Then give it a category and tags to find it fast.</p>
            <AddSystemDialog categories={cats} onAdded={() => router.refresh()} />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--crease)]/50 bg-card/60 p-8">
            <p className="text-sm text-muted-foreground">No templates match.</p>
            <button type="button" onClick={clear} className="text-sm font-medium underline underline-offset-4">Clear filters</button>
          </div>
        ) : (
          <ul className={view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2"}>
            {shown.map((t) => (
              <TemplateItem key={t.id} t={t} view={view} categories={cats} tags={tagList} busy={busy.has(t.id)} onCategory={(c) => void onCategory(t, c)} onTags={(ids) => void onTags(t, ids)} onDelete={() => void onDelete(t)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
