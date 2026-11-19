"use client";

import Link from "next/link";
import { Folder, Settings, Tag } from "lucide-react";
import type { MyDashboard, MyLabel } from "@/server/my-templates";
import { ShareCopy } from "./share-copy";

export interface ManageProps {
  cat: string;
  tag: string;
  onCat: (id: string) => void;
  onTag: (id: string) => void;
  total: number;
  uncategorised: number;
  categories: (MyLabel & { count: number })[];
  tags: (MyLabel & { count: number })[];
  share: MyDashboard["share"];
}

/**
 * Left side of the dashboard: pick a category or tag to filter by (one tap). Making, renaming and
 * deleting them is under Settings (Manage Categories, Manage Tags).
 */
export function ManagePanel(p: ManageProps) {
  const row = (active: boolean) => `flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${active ? "bg-[var(--ink)] font-medium text-white" : "hover:bg-muted"}`;
  const count = (n: number) => <span className="text-xs tabular-nums text-muted-foreground">{n}</span>;
  return (
    <aside className="sheet flex flex-col gap-6 p-4 lg:sticky lg:top-6 lg:self-start" aria-label="Categories and tags">
      <section className="flex flex-col gap-2" aria-labelledby="my-cats">
        <h2 id="my-cats" className="font-display flex items-center gap-2 text-base font-semibold"><Folder className="size-4" aria-hidden /> Categories</h2>
        <ul className="flex flex-col gap-0.5">
          <li className="flex items-center gap-0.5">
            <button type="button" className={row(p.cat === "")} aria-pressed={p.cat === ""} onClick={() => p.onCat("")}><span>All templates</span>{count(p.total)}</button>
            <ShareCopy share={p.share.all} label="all templates" />
          </li>
          <li><button type="button" className={`${row(p.cat === "none")} w-full`} aria-pressed={p.cat === "none"} onClick={() => p.onCat(p.cat === "none" ? "" : "none")}><span>No category</span>{count(p.uncategorised)}</button></li>
          {p.categories.map((c) => (
            <li key={c.id} className="group flex items-center gap-0.5">
              <button type="button" className={row(p.cat === c.id)} aria-pressed={p.cat === c.id} onClick={() => p.onCat(p.cat === c.id ? "" : c.id)}><span className="truncate">{c.name}</span>{count(c.count)}</button>
              <ShareCopy share={p.share.categories[c.id]} label={`category ${c.name}`} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="my-tags">
        <h2 id="my-tags" className="font-display flex items-center gap-2 text-base font-semibold"><Tag className="size-4" aria-hidden /> Tags</h2>
        {p.tags.length === 0 ? <p className="text-xs text-muted-foreground">No tags yet. Make one under Settings, then add it to a template.</p> : null}
        <ul className="flex flex-wrap gap-1.5">
          {p.tags.map((t) => {
            const active = p.tag === t.id;
            return (
              <li key={t.id} className={`flex items-center rounded-full border text-xs ${active ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                <button type="button" aria-pressed={active} onClick={() => p.onTag(active ? "" : t.id)} className="rounded-l-full py-1 pl-2.5 pr-1.5 hover:underline">{t.name} <span className="tabular-nums text-muted-foreground">{t.count}</span></button>
                <ShareCopy share={p.share.tags[t.id]} label={`tag ${t.name}`} className="px-1 py-1 text-muted-foreground hover:text-foreground" />
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <Link href="/my-dashboard?tab=settings&section=categories" className="flex items-center gap-2 hover:text-foreground"><Settings className="size-4" aria-hidden /> Manage Categories</Link>
        <Link href="/my-dashboard?tab=settings&section=tags" className="flex items-center gap-2 hover:text-foreground"><Settings className="size-4" aria-hidden /> Manage Tags</Link>
      </div>
    </aside>
  );
}
