"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { confirmAction, registerConfirmHost, type ConfirmOptions } from "@/lib/confirm";

interface Pending {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

/** The app's one confirmation modal (a native <dialog>): opens for `confirmAction`, closes with Escape, the backdrop or a button. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const answer = useRef(false);

  useEffect(() => {
    registerConfirmHost(
      (opts) =>
        new Promise<boolean>((resolve) => {
          // A second request while one is open cancels the first.
          setPending((old) => {
            old?.resolve(false);
            return { opts, resolve };
          });
        }),
    );
    return () => registerConfirmHost(null);
  }, []);

  if (!pending) return null;
  const { opts, resolve } = pending;
  const danger = (opts.tone ?? "danger") === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) {
          answer.current = false;
          d.showModal();
        }
      }}
      aria-labelledby="confirm-title"
      aria-describedby={opts.description ? "confirm-desc" : undefined}
      onClose={() => {
        resolve(answer.current);
        setPending(null);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // the backdrop
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${danger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold">{opts.title}</h2>
            {opts.description ? <p id="confirm-desc" className="mt-1 text-sm text-muted-foreground">{opts.description}</p> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={(e) => e.currentTarget.closest("dialog")?.close()} className="h-9 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Cancel</button>
          <button
            type="button"
            onClick={(e) => {
              answer.current = true;
              e.currentTarget.closest("dialog")?.close();
            }}
            className={`h-9 rounded-lg px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${danger ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20" : "bg-primary text-primary-foreground hover:bg-primary/85"}`}
          >
            {opts.confirmLabel ?? (danger ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * For a form that must be confirmed before it is sent (the form's own `action` still does the work):
 * `<form action={fn} onSubmit={confirmed({ title: ... })}>`. The form is sent again after the person confirms.
 */
export function useConfirmedSubmit() {
  const ok = useRef(false);
  return (opts: ConfirmOptions) => (e: React.FormEvent<HTMLFormElement>) => {
    if (ok.current) {
      ok.current = false;
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    void confirmAction(opts).then((yes) => {
      if (!yes) return;
      ok.current = true;
      form.requestSubmit();
    });
  };
}
