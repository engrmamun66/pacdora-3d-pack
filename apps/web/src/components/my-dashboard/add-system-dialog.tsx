"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { loadTemplatePicker } from "@/app/(site)/templates/picker-actions";
import { addSystemTemplate } from "@/app/(app)/my-dashboard/actions";
import { notify } from "@/lib/notify";
import type { PublicCategory, PublicTemplate } from "@/server/templates-public";
import type { MyLabel } from "@/server/my-templates";

type State = { status: "idle" | "loading" | "error" } | { status: "ready"; templates: PublicTemplate[]; categories: PublicCategory[] };

/** Pick system templates to copy into the customer's own list (optionally straight into one of their categories). */
export function AddSystemDialog({ categories }: { categories: MyLabel[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [q, setQ] = useState("");
  const [into, setInto] = useState("");
  const [added, setAdded] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const open = () => {
    dialog.current?.showModal();
    if (state.status === "idle" || state.status === "error") {
      setState({ status: "loading" });
      loadTemplatePicker().then((r) => setState({ status: "ready", ...r })).catch(() => setState({ status: "error" }));
    }
  };
  // Closing with Escape or the backdrop is handled by <dialog> itself.
  useEffect(() => {
    const d = dialog.current;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d?.close();
    };
    d?.addEventListener("click", onClick);
    return () => d?.removeEventListener("click", onClick);
  }, []);

  const shown = useMemo(() => {
    if (state.status !== "ready") return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return state.templates.filter((t) => words.every((w) => `${t.name} ${t.description}`.toLowerCase().includes(w)));
  }, [state, q]);

  const add = (t: PublicTemplate) => {
    setBusy(t.id);
    start(async () => {
      const r = await addSystemTemplate(t.id, into || null).catch(() => ({ ok: false, message: "Could not add this template. Please try again." }));
      setBusy(null);
      if (r.ok) {
        setAdded((a) => ({ ...a, [t.id]: (a[t.id] ?? 0) + 1 }));
        notify.success(r.message);
      } else notify.error(r.message);
    });
  };

  return (
    <>
      <button type="button" onClick={open} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/85">
        <Plus className="size-4" aria-hidden /> Add from system templates
      </button>
      <dialog ref={dialog} aria-labelledby="add-sys-title" className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40">
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div>
              <h2 id="add-sys-title" className="text-lg font-semibold">Add from system templates</h2>
              <p className="text-sm text-muted-foreground">Each one is copied into your templates with its standard size and material. Then you can change it.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="flex flex-wrap gap-2 border-b p-4">
            <div className="relative min-w-48 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search system templates" aria-label="Search system templates" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Put in</span>
              <select value={into} onChange={(e) => setInto(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {state.status === "loading" ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}</div> : null}
            {state.status === "error" ? <p role="alert" className="text-sm text-destructive">Could not load the system templates. Close this and try again.</p> : null}
            {state.status === "ready" && shown.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No templates match.</p> : null}
            {state.status === "ready" && shown.length > 0 ? (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2">
                    <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL */}
                      {t.thumbnail ? <img src={t.thumbnail} alt="" className="size-full object-contain" /> : null}
                    </span>
                    <span className="truncate text-sm" title={t.name}>{t.name}</span>
                    <button type="button" disabled={busy === t.id} onClick={() => add(t)} className="h-8 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-60">
                      {busy === t.id ? "Adding…" : added[t.id] ? `Added (${added[t.id]}) · add again` : "Add to my templates"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
