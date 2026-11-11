"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { loadTemplateViewData, type TemplateViewData } from "@/app/doraadmin/template-view-actions";
import type { ViewSettings } from "@/lib/view-settings";
import { ViewSettingsEditor } from "./view-settings-editor";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: TemplateViewData };

/** Icon button that opens the starting-3D-view editor of one template in a dialog (data is loaded when it opens). */
export function ViewSettingsButton({ slug, name, className }: { slug: string; name: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadTemplateViewData(slug)
      .then((r) => live && setState(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.message }))
      .catch(() => live && setState({ status: "error", message: "Could not load the template. Please try again." }));
    return () => {
      live = false;
    };
  }, [open, slug]);

  return (
    <>
      <button type="button" aria-label={`Starting 3D view of ${name}`} title="Starting 3D view" className={className} onClick={() => { setState({ status: "loading" }); setOpen(true); }}>
        <Camera className="size-4" />
      </button>
      {open ? (
        <dialog
          ref={(el) => {
            ref.current = el;
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
          aria-labelledby={`vs-title-${slug}`}
          className="m-auto max-h-[94dvh] w-[min(1040px,calc(100vw-24px))] overflow-auto rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
        >
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div>
              <h2 id={`vs-title-${slug}`} className="font-semibold">Starting 3D view</h2>
              <p className="text-xs text-muted-foreground">{name}: the view customers see first.</p>
            </div>
            <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}><X className="size-4" /></button>
          </div>
          <div className="p-5">
            {state.status === "loading" ? <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p> : null}
            {state.status === "error" ? <p role="alert" className="py-10 text-center text-sm text-destructive">{state.message}</p> : null}
            {state.status === "ready" ? <ViewSettingsEditor slug={slug} data={state.data} /> : null}
          </div>
        </dialog>
      ) : null}
    </>
  );
}

/** The same editor inside a page section: it loads the saved template when the admin asks for it. */
export function ViewSettingsInline({ slug, onSaved }: { slug: string; onSaved?: (v: ViewSettings | null) => void }) {
  const [state, setState] = useState<State | null>(null);
  const load = () => {
    setState({ status: "loading" });
    loadTemplateViewData(slug)
      .then((r) => setState(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.message }))
      .catch(() => setState({ status: "error", message: "Could not load the template. Please try again." }));
  };
  if (!state) {
    return (
      <button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
        <Camera className="size-4" aria-hidden /> Open the 3D view editor
      </button>
    );
  }
  if (state.status === "loading") return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (state.status === "error") return <p role="alert" className="text-sm text-destructive">{state.message}</p>;
  return <ViewSettingsEditor slug={slug} data={state.data} {...(onSaved ? { onSaved } : {})} />;
}
