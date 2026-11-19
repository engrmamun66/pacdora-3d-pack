"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Trash2 } from "lucide-react";
import { deleteClientProject, renameClientProject } from "@/app/doraadmin/client-project-actions";
import { confirmAction } from "@/lib/confirm";
import { notify } from "@/lib/notify";

export interface ProjectLink {
  label: string;
  path: string;
  /** Shown under the label: who can open it. */
  note: string;
}

/** What a super admin can do with a client's project: copy the pages the client can open, rename it, delete it. */
export function ClientProjectActions({ id, name, links }: { id: string; name: string; links: ProjectLink[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(name);
  const btn = "grid size-8 place-items-center rounded-md border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";

  const copy = async (l: ProjectLink) => {
    const url = `${window.location.origin}${l.path}`;
    if (menu.current) menu.current.open = false;
    try {
      await navigator.clipboard.writeText(url);
      notify.success(`${l.label} link copied.`, { description: l.note });
    } catch {
      notify.error("The link could not be copied.", { description: url });
    }
  };

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          notify.success(r.message);
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });

  return (
    <div className="flex justify-end gap-1">
      <details ref={menu} className="relative">
        <summary className={`${btn} cursor-pointer list-none`} title="Copy a link the client can open" aria-label={`Copy a link of ${name}`}>
          <Link2 className="size-4" aria-hidden />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-popover p-1 text-left text-popover-foreground shadow-lg">
          {links.map((l) => (
            <button key={l.path} type="button" onClick={() => void copy(l)} className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
              <span className="text-sm font-medium">Copy {l.label.toLowerCase()} link</span>
              <span className="text-xs text-muted-foreground">{l.note}</span>
            </button>
          ))}
        </div>
      </details>
      <button type="button" className={btn} disabled={pending} title="Rename" aria-label={`Rename ${name}`} onClick={() => { setDraft(name); dialog.current?.showModal(); }}>
        <Pencil className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        disabled={pending}
        title="Delete"
        aria-label={`Delete ${name}`}
        className="grid size-8 place-items-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
        onClick={async () => {
          if (await confirmAction({ title: `Delete "${name}"?`, description: "The client's project is deleted, with its 3D pictures and share links. This cannot be undone." })) run(() => deleteClientProject(id));
        }}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>

      <dialog ref={dialog} aria-labelledby={`rename-${id}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/40">
        <form
          className="flex flex-col gap-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            dialog.current?.close();
            run(() => renameClientProject(id, draft));
          }}
        >
          <h2 id={`rename-${id}`} className="text-base font-semibold">Rename project</h2>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} autoFocus aria-label="Project name" className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="h-9 rounded-lg border border-red-600 bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700">Cancel</button>
            <button type="submit" disabled={!draft.trim()} className="h-9 rounded-lg border border-black bg-black px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
