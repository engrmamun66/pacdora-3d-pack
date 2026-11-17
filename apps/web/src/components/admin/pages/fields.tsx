"use client";

import Link from "next/link";
import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { resetSiteContent, saveSiteContent } from "@/app/doraadmin/page-actions";
import type { ContentPart } from "@/lib/site-content";

const inputCls = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** A labelled text field. With `rows` it is a text area. Shows how many characters are left when few remain. */
export function TextField({ label, value, onChange, max, rows, hint, placeholder, mono = false }: { label: string; value: string; onChange: (v: string) => void; max: number; rows?: number; hint?: string; placeholder?: string; mono?: boolean }) {
  const id = useId();
  const left = max - value.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {left <= Math.max(10, max * 0.15) ? <span className={`text-xs font-normal tabular-nums ${left < 0 ? "text-destructive" : "text-muted-foreground"}`}>{left} left</span> : null}
      </label>
      {rows ? (
        <textarea id={id} rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} aria-describedby={hint ? `${id}-h` : undefined} />
      ) : (
        <input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} h-9 ${mono ? "font-mono text-xs" : ""}`} aria-describedby={hint ? `${id}-h` : undefined} />
      )}
      {hint ? <p id={`${id}-h`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The two fields of a link: what it says and where it goes. */
export function LinkFields({ legend, value, onChange, optional = false }: { legend: string; value: { label: string; href: string }; onChange: (v: { label: string; href: string }) => void; optional?: boolean }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{legend}{optional ? <span className="font-normal text-muted-foreground"> (leave the label empty to hide it)</span> : null}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label="Label" value={value.label} onChange={(label) => onChange({ ...value, label })} max={60} />
        <TextField label="Goes to" value={value.href} onChange={(href) => onChange({ ...value, href })} max={300} placeholder="/templates" mono hint="/page, #place or https://…" />
      </div>
    </fieldset>
  );
}

/** An On / Off switch with its label. */
export function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A section of a page form that opens and closes. */
export function Panel({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border bg-card shadow-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          {summary ? <span className="block truncate text-xs text-muted-foreground">{summary}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
};

const iconBtn = "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** A list of things an admin can add to, take from and put in order. `render` draws the fields of one item. */
export function ListEditor<T>({ items, onChange, render, make, max, noun, title, fixed = false }: { items: T[]; onChange: (v: T[]) => void; render: (item: T, set: (v: T) => void, index: number) => ReactNode; make: () => T; max: number; noun: string; title: (item: T, index: number) => string; /** Order only: nothing can be added or removed. */ fixed?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="rounded-lg border bg-background/60">
            <div className="flex items-center gap-1 border-b px-2 py-1">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title(item, i) || <span className="font-normal text-muted-foreground">New {noun}</span>}</span>
              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))} aria-label={`Move ${noun} ${i + 1} up`} title="Move up"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" className={iconBtn} disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))} aria-label={`Move ${noun} ${i + 1} down`} title="Move down"><ArrowDown className="size-4" aria-hidden /></button>
              {fixed ? null : <button type="button" className={`${iconBtn} hover:text-destructive`} onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove ${noun} ${i + 1}`} title="Remove"><Trash2 className="size-4" aria-hidden /></button>}
            </div>
            <div className="flex flex-col gap-3 p-3">{render(item, (v) => onChange(items.map((x, k) => (k === i ? v : x))), i)}</div>
          </li>
        ))}
      </ul>
      {fixed ? null : (
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={items.length >= max} onClick={() => onChange([...items, make()])}><Plus className="size-4" aria-hidden /> Add {noun}</Button>
          <span className="text-xs text-muted-foreground tabular-nums">{items.length} of {max}</span>
        </div>
      )}
    </div>
  );
}

/** A list of short lines (for example the points under the hero). */
export function StringList({ label, items, onChange, max, maxLength, noun }: { label: string; items: string[]; onChange: (v: string[]) => void; max: number; maxLength: number; noun: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <ul className="flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex items-center gap-1">
            <input value={s} maxLength={maxLength} aria-label={`${noun} ${i + 1}`} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} className={`${inputCls} h-9`} />
            <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))} aria-label={`Move ${noun} ${i + 1} up`}><ArrowUp className="size-4" aria-hidden /></button>
            <button type="button" className={iconBtn} disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))} aria-label={`Move ${noun} ${i + 1} down`}><ArrowDown className="size-4" aria-hidden /></button>
            <button type="button" className={`${iconBtn} hover:text-destructive`} onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove ${noun} ${i + 1}`}><Trash2 className="size-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={items.length >= max} onClick={() => onChange([...items, ""])}><Plus className="size-4" aria-hidden /> Add {noun}</Button>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length} of {max}</span>
      </div>
    </fieldset>
  );
}

/**
 * The bar under every page form: Save, a link to look at the page, and "back to the built-in text".
 * `dirty` shows a note while there are changes that are not saved yet.
 */
export function SaveBar<T>({ part, value, dirty, viewHref, onSaved, onReset }: { part: ContentPart; value: T; dirty: boolean; viewHref: string; onSaved: () => void; onReset: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const save = () =>
    start(async () => {
      const r = await saveSiteContent(part, value).catch(() => ({ ok: false, message: "Could not save. Check your connection and try again." }));
      if (r.ok) {
        notify.success(r.message, { id: "page-save" });
        onSaved();
        router.refresh();
      } else notify.error(r.message, { id: "page-save" });
    });
  const reset = () =>
    start(async () => {
      const r = await resetSiteContent(part).catch(() => ({ ok: false, message: "Could not restore. Try again." }));
      setConfirming(false);
      if (r.ok) {
        notify.success(r.message, { id: "page-save" });
        onReset();
        router.refresh();
      } else notify.error(r.message, { id: "page-save" });
    });
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
      <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
      <Link href={viewHref} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted">View page <ExternalLink className="size-3.5" aria-hidden /></Link>
      <span role="status" className="text-sm text-muted-foreground">{dirty ? "You have changes that are not saved." : ""}</span>
      <span className="ml-auto flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm">Replace this page&apos;s text with the built-in text?</span>
            <Button type="button" variant="destructive" size="sm" onClick={reset} disabled={busy}>Yes, restore</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>Keep mine</Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={busy}><RotateCcw className="size-4" aria-hidden /> Restore built-in text</Button>
        )}
      </span>
    </div>
  );
}
