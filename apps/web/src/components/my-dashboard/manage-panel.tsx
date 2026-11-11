"use client";

import { useRef, useState } from "react";
import { Folder, Pencil, Tag, X } from "lucide-react";
import type { MyResult } from "@/app/(dash)/my-dashboard/actions";
import type { MyLabel } from "@/server/my-templates";

const inputCls = "h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function AddBox({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<MyResult> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = ref.current?.value.trim() ?? "";
        if (!name || busy) return;
        setBusy(true);
        const ok = await onAdd(name);
        setBusy(false);
        if (ok.ok && ref.current) ref.current.value = "";
      }}
    >
      <input ref={ref} className={inputCls} maxLength={40} placeholder={label} aria-label={label} />
      <button type="submit" disabled={busy} className="h-9 shrink-0 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">Add</button>
    </form>
  );
}

export interface ManageProps {
  cat: string;
  tag: string;
  onCat: (id: string) => void;
  onTag: (id: string) => void;
  total: number;
  uncategorised: number;
  categories: (MyLabel & { count: number })[];
  tags: (MyLabel & { count: number })[];
  onCreateCategory: (name: string) => Promise<MyResult>;
  onCreateTag: (name: string) => Promise<MyResult>;
  onRenameCategory: (id: string) => void;
  onRenameTag: (id: string) => void;
  onDeleteCategory: (id: string) => void;
  onDeleteTag: (id: string) => void;
}

/**
 * Left side of the dashboard: pick a category or tag to filter by (one tap), and make, rename or
 * delete the customer's own categories and tags.
 */
export function ManagePanel(p: ManageProps) {
  const row = (active: boolean) => `flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`;
  const iconBtn = "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
  const count = (n: number) => <span className="text-xs tabular-nums text-muted-foreground">{n}</span>;
  return (
    <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start" aria-label="Categories and tags">
      <section className="flex flex-col gap-2" aria-labelledby="my-cats">
        <h2 id="my-cats" className="flex items-center gap-2 text-sm font-semibold"><Folder className="size-4" aria-hidden /> Categories</h2>
        <ul className="flex flex-col gap-0.5">
          <li><button type="button" className={`${row(p.cat === "")} w-full`} aria-pressed={p.cat === ""} onClick={() => p.onCat("")}><span>All templates</span>{count(p.total)}</button></li>
          <li><button type="button" className={`${row(p.cat === "none")} w-full`} aria-pressed={p.cat === "none"} onClick={() => p.onCat(p.cat === "none" ? "" : "none")}><span>No category</span>{count(p.uncategorised)}</button></li>
          {p.categories.map((c) => (
            <li key={c.id} className="group flex items-center gap-0.5">
              <button type="button" className={row(p.cat === c.id)} aria-pressed={p.cat === c.id} onClick={() => p.onCat(p.cat === c.id ? "" : c.id)}><span className="truncate">{c.name}</span>{count(c.count)}</button>
              <button type="button" className={iconBtn} aria-label={`Rename category ${c.name}`} onClick={() => p.onRenameCategory(c.id)}><Pencil className="size-3.5" aria-hidden /></button>
              <button type="button" className={`${iconBtn} hover:text-destructive`} aria-label={`Delete category ${c.name}`} onClick={() => p.onDeleteCategory(c.id)}><X className="size-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
        <AddBox label="New category" onAdd={p.onCreateCategory} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="my-tags">
        <h2 id="my-tags" className="flex items-center gap-2 text-sm font-semibold"><Tag className="size-4" aria-hidden /> Tags</h2>
        {p.tags.length === 0 ? <p className="text-xs text-muted-foreground">No tags yet. Make one below, then add it to a template.</p> : null}
        <ul className="flex flex-wrap gap-1.5">
          {p.tags.map((t) => {
            const active = p.tag === t.id;
            return (
              <li key={t.id} className={`flex items-center rounded-full border text-xs ${active ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                <button type="button" aria-pressed={active} onClick={() => p.onTag(active ? "" : t.id)} className="rounded-l-full py-1 pl-2.5 pr-1.5 hover:underline">{t.name} <span className="tabular-nums text-muted-foreground">{t.count}</span></button>
                <button type="button" aria-label={`Rename tag ${t.name}`} onClick={() => p.onRenameTag(t.id)} className="px-1 py-1 text-muted-foreground hover:text-foreground"><Pencil className="size-3" aria-hidden /></button>
                <button type="button" aria-label={`Delete tag ${t.name}`} onClick={() => p.onDeleteTag(t.id)} className="rounded-r-full py-1 pr-2 pl-0.5 text-muted-foreground hover:text-destructive"><X className="size-3" aria-hidden /></button>
              </li>
            );
          })}
        </ul>
        <AddBox label="New tag" onAdd={p.onCreateTag} />
      </section>
    </aside>
  );
}
