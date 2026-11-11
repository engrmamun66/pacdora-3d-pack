"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMyTemplate, setTemplateCategory, setTemplateTags, type MyResult } from "@/app/(app)/my-dashboard/actions";
import { notify } from "@/lib/notify";
import type { MyLabel, MyTemplateRow } from "@/server/my-templates";

/** One of the customer's templates: open it, give it a category and tags, or delete it. */
export function TemplateCard({ t, categories, tags }: { t: MyTemplateRow; categories: MyLabel[]; tags: MyLabel[] }) {
  const [pending, start] = useTransition();
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [tagIds, setTagIds] = useState(t.tagIds);

  const run = (job: () => Promise<MyResult>, onFail?: () => void, quiet = false) =>
    start(async () => {
      const r = await job().catch(() => ({ ok: false, message: "Could not save. Please try again." }));
      if (r.ok) {
        if (!quiet) notify.success(r.message);
      } else {
        onFail?.();
        notify.error(r.message);
      }
    });

  const toggleTag = (id: string, on: boolean) => {
    const before = tagIds;
    const next = on ? [...before, id] : before.filter((x) => x !== id);
    setTagIds(next);
    run(() => setTemplateTags(t.id, next), () => setTagIds(before), true);
  };
  const mine = tags.filter((x) => tagIds.includes(x.id));

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      <Link href={`/projects/${t.id}`} className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Open ${t.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL */}
        {t.thumbnail ? <img src={t.thumbnail} alt="" className="max-h-full max-w-full" /> : <span className="text-xs text-muted-foreground">No preview</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <Link href={`/projects/${t.id}`} className="block truncate text-sm font-medium hover:underline">{t.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{t.templateName} · {t.updatedAt}</p>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <select
            value={categoryId}
            disabled={pending}
            onChange={(e) => {
              const before = categoryId;
              setCategoryId(e.target.value);
              run(() => setTemplateCategory(t.id, e.target.value || null), () => setCategoryId(before));
            }}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {mine.map((x) => <span key={x.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{x.name}</span>)}
          {tags.length > 0 ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">{mine.length ? "Edit tags" : "Add tags"}</summary>
              <div className="absolute left-0 z-20 mt-1 flex max-h-48 w-48 flex-col gap-1 overflow-y-auto rounded-lg border bg-popover p-2 shadow-lg">
                {tags.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={tagIds.includes(x.id)} disabled={pending} onChange={(e) => toggleTag(x.id, e.target.checked)} />
                    <span className="truncate">{x.name}</span>
                  </label>
                ))}
              </div>
            </details>
          ) : mine.length === 0 ? <span className="text-xs text-muted-foreground">Make a tag on the left to add it here.</span> : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Link href={`/projects/${t.id}`} className="text-sm font-medium text-primary hover:underline">Open</Link>
          <button
            type="button"
            disabled={pending}
            aria-label={`Delete ${t.name}`}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            onClick={() => {
              if (window.confirm(`Delete "${t.name}"? This cannot be undone.`)) run(() => deleteMyTemplate(t.id));
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}
