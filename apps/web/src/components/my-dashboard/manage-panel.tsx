"use client";

import Link from "next/link";
import { useRef, useTransition } from "react";
import { Tag, Trash2, Folder } from "lucide-react";
import { createCategory, createTag, deleteCategory, deleteTag, type MyResult } from "@/app/(app)/my-dashboard/actions";
import { notify } from "@/lib/notify";
import type { MyLabel } from "@/server/my-templates";
import { dashHref, type DashFilter } from "@/lib/dash-href";

const inputCls = "h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const addCls = "h-9 shrink-0 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60";

function AddBox({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<MyResult> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = ref.current?.value.trim() ?? "";
        if (!name) return;
        start(async () => {
          const r = await onAdd(name).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
          if (r.ok) {
            notify.success(r.message);
            if (ref.current) ref.current.value = "";
          } else notify.error(r.message);
        });
      }}
    >
      <input ref={ref} className={inputCls} maxLength={40} placeholder={label} aria-label={label} />
      <button type="submit" disabled={pending} className={addCls}>Add</button>
    </form>
  );
}

/**
 * Left side of the dashboard: filter by category or tag (plain links, so the list is server-rendered)
 * and make or delete the customer's own categories and tags.
 */
export function ManagePanel({ filter, total, uncategorised, categories, tags }: { filter: DashFilter; total: number; uncategorised: number; categories: MyLabel[]; tags: MyLabel[] }) {
  const [pending, start] = useTransition();
  const remove = (what: "category" | "tag", item: MyLabel) => {
    if (!window.confirm(`Delete the ${what} "${item.name}"? Your templates are kept${item.count ? ` (${item.count} will lose it)` : ""}.`)) return;
    start(async () => {
      const r = await (what === "category" ? deleteCategory(item.id) : deleteTag(item.id)).catch(() => ({ ok: false, message: "Could not delete. Please try again." }));
      if (r.ok) notify.success(r.message);
      else notify.error(r.message);
    });
  };
  const row = (active: boolean) => `flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`;
  const del = "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-destructive hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40";
  return (
    <aside className="flex flex-col gap-6" aria-label="Categories and tags">
      <section className="flex flex-col gap-2" aria-labelledby="my-cats">
        <h2 id="my-cats" className="flex items-center gap-2 text-sm font-semibold"><Folder className="size-4" aria-hidden /> Categories</h2>
        <ul className="flex flex-col gap-0.5">
          <li><Link href={dashHref({ ...filter, cat: "" })} className={row(!filter.cat)} aria-current={!filter.cat ? "true" : undefined}><span>All templates</span><span className="text-xs tabular-nums text-muted-foreground">{total}</span></Link></li>
          <li><Link href={dashHref({ ...filter, cat: "none" })} className={row(filter.cat === "none")} aria-current={filter.cat === "none" ? "true" : undefined}><span>No category</span><span className="text-xs tabular-nums text-muted-foreground">{uncategorised}</span></Link></li>
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <Link href={dashHref({ ...filter, cat: c.id })} className={row(filter.cat === c.id)} aria-current={filter.cat === c.id ? "true" : undefined}><span className="truncate">{c.name}</span><span className="text-xs tabular-nums text-muted-foreground">{c.count}</span></Link>
              <button type="button" className={del} disabled={pending} aria-label={`Delete category ${c.name}`} onClick={() => remove("category", c)}><Trash2 className="size-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
        <AddBox label="New category" onAdd={createCategory} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="my-tags">
        <h2 id="my-tags" className="flex items-center gap-2 text-sm font-semibold"><Tag className="size-4" aria-hidden /> Tags</h2>
        {tags.length === 0 ? <p className="text-xs text-muted-foreground">No tags yet.</p> : null}
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const active = filter.tag === t.id;
            return (
              <li key={t.id} className={`flex items-center rounded-full border text-xs ${active ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                <Link href={dashHref({ ...filter, tag: active ? "" : t.id })} aria-current={active ? "true" : undefined} className="rounded-l-full py-1 pl-2.5 pr-1.5 hover:underline">{t.name} <span className="tabular-nums text-muted-foreground">{t.count}</span></Link>
                <button type="button" disabled={pending} aria-label={`Delete tag ${t.name}`} className="rounded-r-full py-1 pr-2 pl-0.5 text-muted-foreground hover:text-destructive disabled:opacity-40" onClick={() => remove("tag", t)}>×</button>
              </li>
            );
          })}
        </ul>
        <AddBox label="New tag" onAdd={createTag} />
      </section>
    </aside>
  );
}
