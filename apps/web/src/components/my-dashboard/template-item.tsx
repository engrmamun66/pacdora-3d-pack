"use client";

import Link from "next/link";
import { useRef } from "react";
import { Folder, SlidersHorizontal, Trash2 } from "lucide-react";
import type { MyLabel, MyTemplateRow } from "@/server/my-templates";

export interface ItemProps {
  t: MyTemplateRow;
  view: "grid" | "list";
  categories: MyLabel[];
  tags: MyLabel[];
  /** A change for this template is being saved. */
  busy: boolean;
  onCategory: (categoryId: string | null) => void;
  onTags: (tagIds: string[]) => void;
  onDelete: () => void;
}

/** One of the customer's templates, as a card or a row: open it, organise it (category, tags) or delete it. */
export function TemplateItem({ t, view, categories, tags, busy, onCategory, onTags, onDelete }: ItemProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const category = categories.find((c) => c.id === t.categoryId) ?? null;
  const mine = tags.filter((x) => t.tagIds.includes(x.id));
  const shownTags = mine.slice(0, 3);
  const href = `/projects/${t.id}`;
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  const chips = (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {category ? <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"><Folder className="size-3 shrink-0" aria-hidden /><span className="truncate">{category.name}</span></span> : null}
      {shownTags.map((x) => <span key={x.id} className="max-w-28 truncate rounded-full bg-muted px-2 py-0.5 text-xs">{x.name}</span>)}
      {mine.length > shownTags.length ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">+{mine.length - shownTags.length}</span> : null}
      {!category && mine.length === 0 ? <span className="text-xs text-muted-foreground">Not organised yet</span> : null}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-1.5">
      <Link href={href} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring">Open</Link>
      <button type="button" className={btn} disabled={busy} onClick={() => dialog.current?.showModal()} aria-label={`Organise ${t.name}: category and tags`}>
        <SlidersHorizontal className="size-3.5" aria-hidden /> Organise
      </button>
      <button type="button" disabled={busy} aria-label={`Delete ${t.name}`} onClick={onDelete} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );

  const thumb = t.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
    <img src={t.thumbnail} alt="" className="max-h-full max-w-full" />
  ) : (
    <span className="text-xs text-muted-foreground">No preview</span>
  );

  const organise = (
    <dialog ref={dialog} aria-labelledby={`org-${t.id}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40" onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 id={`org-${t.id}`} className="text-base font-semibold">Organise</h2>
          <p className="truncate text-sm text-muted-foreground">{t.name}</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Category
          <select value={t.categoryId ?? ""} onChange={(e) => onCategory(e.target.value || null)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-normal">
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {categories.length === 0 ? <span className="text-xs font-normal text-muted-foreground">Make a category in the panel on the dashboard first.</span> : null}
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Tags</legend>
          {tags.length === 0 ? <p className="text-xs text-muted-foreground">Make a tag in the panel on the dashboard first.</p> : null}
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            {tags.map((x) => (
              <label key={x.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={t.tagIds.includes(x.id)} onChange={(e) => onTags(e.target.checked ? [...t.tagIds, x.id] : t.tagIds.filter((id) => id !== x.id))} />
                <span className="truncate">{x.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <button type="button" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85" onClick={() => dialog.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );

  if (view === "list") {
    return (
      <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-2.5 shadow-xs ${busy ? "opacity-70" : ""}`}>
        <Link href={href} aria-label={`Open ${t.name}`} className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-1">{thumb}</Link>
        <div className="min-w-0 flex-1 basis-48">
          <Link href={href} className="block truncate text-sm font-medium hover:underline">{t.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{t.templateName} · {t.updatedAt}</p>
        </div>
        <div className="min-w-0 flex-1 basis-48">{chips}</div>
        {actions}
        {organise}
      </li>
    );
  }
  return (
    <li className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm ${busy ? "opacity-70" : ""}`}>
      <Link href={href} aria-label={`Open ${t.name}`} className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">{thumb}</Link>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="min-w-0">
          <Link href={href} className="block truncate text-sm font-medium hover:underline" title={t.name}>{t.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{t.templateName} · {t.updatedAt}</p>
        </div>
        {chips}
        <div className="mt-auto pt-1">{actions}</div>
      </div>
      {organise}
    </li>
  );
}
