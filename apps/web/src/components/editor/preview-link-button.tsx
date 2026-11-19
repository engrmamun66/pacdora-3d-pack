"use client";

import { useRef, useState } from "react";
import { Check, ExternalLink, Eye, Link2, X } from "lucide-react";
import { notify } from "@/lib/notify";

/**
 * "Link": copies the address of this template on the Client's shared pages (the 3D preview customers see). When the link is switched
 * off the address is still copied, with a note that it shows nothing yet.
 */
export function PreviewLinkButton({ path, active }: { path: string; active: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      notify.error("The link could not be copied.", { description: url });
      return;
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
    if (!active) notify.warning("Link copied, but it is switched off.", { id: "preview-link", description: "Turn it on in My dashboard > Share so people can open it." });
  };
  const Icon = done ? Check : Link2;
  return (
    <button type="button" onClick={() => void copy()} title="Copy preview link" aria-label="Copy preview link" className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Icon className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden /> Link
    </button>
  );
}

/** "Open": the same address in a new tab, to see the page the way customers do. */
export function PreviewOpenButton({ path, active }: { path: string; active: boolean }) {
  return (
    <a href={path} target="_blank" rel="noopener noreferrer" title={active ? "Open the preview page in a new tab" : "Open the preview page (the link is switched off, so it shows nothing yet)"} className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <ExternalLink className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden /> Open
    </a>
  );
}

/**
 * "Preview": the shared page of this template, as customers see it, in a big box over the editor (no new tab). The design is saved first,
 * so the page shows what is on screen. The box closes with Escape, the X, or a click outside it.
 */
export function PreviewModalButton({ path, active, beforeOpen }: { path: string; active: boolean; beforeOpen?: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // A new key reloads the page inside, so it is fresh every time the box opens.
  const [run, setRun] = useState(0);

  const show = async () => {
    await beforeOpen?.();
    setRun((n) => n + 1);
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <>
      <button type="button" onClick={() => void show()} title="Preview the public page in a big box" aria-label="Preview the public page" className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Eye className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden /> Preview
      </button>
      <dialog
        ref={dialog}
        aria-label="Preview of the public page"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto h-[min(92dvh,60rem)] w-[min(96vw,84rem)] overflow-hidden rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {open ? (
          <div className="flex size-full flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
              <span className="font-medium">Preview</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{active ? "The page customers see." : "The link is switched off, so customers see nothing yet. Turn it on in My dashboard > Share."}</span>
              <a href={path} target="_blank" rel="noopener noreferrer" className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted">
                <ExternalLink className="size-3.5" aria-hidden /> Open in a new tab
              </a>
              <button type="button" onClick={() => dialog.current?.close()} title="Close" aria-label="Close the preview" className="grid size-7 place-items-center rounded-md hover:bg-muted">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <iframe key={run} src={path} title="Preview of the public page" className="min-h-0 w-full flex-1 bg-background" />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
