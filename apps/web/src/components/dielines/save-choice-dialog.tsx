"use client";

import { useEffect, useRef, useState } from "react";
import { FilePlus2, RefreshCw } from "lucide-react";
import type { SavedOfTemplate } from "@/app/(app)/projects/actions";
import { confirmAction } from "@/lib/confirm";
import { firstFree, isProjectSlug, projectSlug } from "@/lib/project-slug";

type Result = { ok: boolean; message: string | null };

const field = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** The first "Name 2", "Name 3" ... that none of the Client's saved projects of this template uses yet. */
function suggestName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 2; n < 1000; n++) if (!used.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`.slice(0, 120);
  return name;
}

/**
 * Opens on Save of a template page when the Client has already saved projects from this template. They can overwrite one of
 * them with what they see now, or save it as a new project with its own name and slug (both unique among their projects).
 */
export function SaveChoiceDialog({ existing, name, onClose, onOverwrite, onSaveNew }: { existing: SavedOfTemplate[] | null; name: string; onClose: () => void; onOverwrite: (project: SavedOfTemplate) => Promise<Result>; onSaveNew: (name: string, slug: string) => Promise<Result> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = existing !== null;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="save-choice-title"
      onClose={onClose}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      {existing ? <SaveChoiceForm existing={existing} name={name} onClose={() => dialog.current?.close()} onOverwrite={onOverwrite} onSaveNew={onSaveNew} /> : null}
    </dialog>
  );
}

function SaveChoiceForm({ existing, name, onClose, onOverwrite, onSaveNew }: { existing: SavedOfTemplate[]; name: string; onClose: () => void; onOverwrite: (project: SavedOfTemplate) => Promise<Result>; onSaveNew: (name: string, slug: string) => Promise<Result> }) {
  const [newName, setNewName] = useState(() => suggestName(name, existing.map((e) => e.name)));
  const [slug, setSlug] = useState(() => firstFree(projectSlug(suggestName(name, existing.map((e) => e.name))), (c) => existing.some((e) => e.slug === c)));
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameTaken = existing.some((e) => e.name.toLowerCase() === newName.trim().toLowerCase());
  const slugTaken = existing.some((e) => e.slug === slug);
  const slugBad = slug !== "" && !isProjectSlug(slug);
  const problem = newName.trim() === "" ? "Give the project a name." : nameTaken ? "You already have a project with this name." : slug === "" ? "Give the project a slug." : slugBad ? "Slug: small letters, digits and single dashes only." : slugTaken ? "This slug is used by another of your projects." : null;

  const done = (r: Result) => {
    setBusy(null);
    if (r.ok) onClose();
    else setError(r.message ?? "Could not save.");
  };

  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <h2 id="save-choice-title" className="text-base font-semibold">You already saved this template</h2>
        <p className="text-sm text-muted-foreground">
          {existing.length === 1 ? "1 project was" : `${existing.length} projects were`} made from it. Overwrite one with what you see now, or save a new project.
        </p>
      </div>

      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" aria-label="Your projects made from this template">
        {existing.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{p.slug}</span> · saved {new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setError(null);
                if (!(await confirmAction({ title: `Overwrite "${p.name}"?`, description: "Its size and settings are replaced with what you see now. Its artwork and 3D settings stay. This cannot be undone.", confirmLabel: "Overwrite" }))) return;
                setBusy(p.id);
                done(await onOverwrite(p).catch(() => ({ ok: false, message: "Could not save. Please try again." })));
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" aria-hidden /> {busy === p.id ? "Saving…" : "Overwrite"}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (problem) return;
          setError(null);
          setBusy("new");
          done(await onSaveNew(newName.trim(), slug).catch(() => ({ ok: false, message: "Could not save. Please try again." })));
        }}
      >
        <h3 className="text-sm font-semibold">Or save as a new project</h3>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            value={newName}
            maxLength={120}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!slugEdited) setSlug(firstFree(projectSlug(e.target.value), (c) => existing.some((x) => x.slug === c)));
            }}
            aria-invalid={nameTaken || undefined}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Slug
          <input
            value={slug}
            maxLength={60}
            spellCheck={false}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
            }}
            aria-invalid={slugBad || slugTaken || undefined}
            className={`${field} font-mono`}
          />
          <span className="text-xs font-normal text-muted-foreground">The short name of this project. It follows the name until you change it.</span>
        </label>
        {problem || error ? <p role="alert" className="text-sm text-destructive">{error ?? problem}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy !== null} onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-red-600 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy !== null || problem !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black bg-black px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">
            <FilePlus2 className="size-4" aria-hidden /> {busy === "new" ? "Saving…" : "Save as new project"}
          </button>
        </div>
      </form>
    </div>
  );
}
