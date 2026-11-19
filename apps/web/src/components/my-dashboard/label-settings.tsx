"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, Pencil, Tag, Trash2, X } from "lucide-react";
import { createCategory, createTag, deleteCategory, deleteTag, renameCategory, renameTag, type MyResult } from "@/app/(dash)/my-dashboard/actions";
import { notify } from "@/lib/notify";
import { confirmAction } from "@/lib/confirm";
import type { MyLabel } from "@/server/my-templates";

type Label = MyLabel & { count: number };
type Kind = "category" | "tag";

const input = "h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const FAIL: MyResult = { ok: false, message: "Could not save. Please try again." };

function AddBox({ label, busy, onAdd }: { label: string; busy: boolean; onAdd: (name: string) => Promise<boolean> }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = ref.current?.value.trim() ?? "";
        if (!name || busy) return;
        if ((await onAdd(name)) && ref.current) ref.current.value = "";
      }}
    >
      <input ref={ref} className={input} maxLength={40} placeholder={label} aria-label={label} />
      <button type="submit" disabled={busy} className="h-9 shrink-0 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">Add</button>
    </form>
  );
}

/** A modal box (native <dialog>): opens when mounted, closes with Escape, the backdrop or the close button. */
function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) d.showModal();
      }}
      aria-labelledby="label-modal-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close(); // a click on the backdrop
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="label-modal-title" className="text-lg font-semibold">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={(e) => e.currentTarget.closest("dialog")?.close()} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-4" aria-hidden /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function Group({ kind, title, icon: Icon, hint, labels, busy, onAdd, onRename, onDelete }: { kind: Kind; title: string; icon: typeof Folder; hint: string; labels: Label[]; busy: boolean; onAdd: (kind: Kind, name: string) => Promise<boolean>; onRename: (kind: Kind, l: Label) => void; onDelete: (kind: Kind, l: Label) => void }) {
  const iconBtn = "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`label-${kind}`}>
      <div>
        <h3 id={`label-${kind}`} className="font-display flex items-center gap-2 text-lg font-semibold"><Icon className="size-4" aria-hidden /> {title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {labels.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No {kind === "category" ? "categories" : "tags"} yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {labels.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{l.count} {l.count === 1 ? "template" : "templates"}</span>
              <button type="button" className={iconBtn} disabled={busy} aria-label={`Rename ${kind} ${l.name}`} onClick={() => onRename(kind, l)}><Pencil className="size-4" aria-hidden /></button>
              <button type="button" className={`${iconBtn} hover:text-destructive`} disabled={busy} aria-label={`Delete ${kind} ${l.name}`} onClick={() => onDelete(kind, l)}><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <AddBox label={kind === "category" ? "New category" : "New tag"} busy={busy} onAdd={(name) => onAdd(kind, name)} />
    </section>
  );
}

/** Settings > Manage Categories / Manage Tags: make, rename and delete the Client's own categories or tags. */
export function LabelSettings({ kind, labels }: { kind: Kind; labels: Label[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState<Label | null>(null);
  const working = busy || pending;

  /** Run an action; show its message; reload the list when it worked. */
  const run = async (fn: () => Promise<MyResult>) => {
    setPending(true);
    const r = await fn().catch(() => FAIL);
    setPending(false);
    if (r.ok) {
      notify.success(r.message);
      start(() => router.refresh());
    } else notify.error(r.message);
    return r.ok;
  };

  const add = (k: Kind, name: string) => run(() => (k === "category" ? createCategory(name) : createTag(name)));
  const word = kind === "category" ? "category" : "tag";
  const askDelete = async (l: Label) => {
    const yes = await confirmAction({ title: `Delete ${word} "${l.name}"?`, description: `Your templates are kept${l.count ? ` (${l.count} will lose it)` : ""}.` });
    if (yes) await run(() => (kind === "category" ? deleteCategory(l.id) : deleteTag(l.id)));
  };

  return (
    <>
      {kind === "category" ? (
        <Group kind="category" title="Categories" icon={Folder} hint="Folders for sorting your templates. A template is in one category at most." labels={labels} busy={working} onAdd={add} onRename={(_, l) => setRenaming(l)} onDelete={(_, l) => void askDelete(l)} />
      ) : (
        <Group kind="tag" title="Tags" icon={Tag} hint="Labels you can put on any template, several at once." labels={labels} busy={working} onAdd={add} onRename={(_, l) => setRenaming(l)} onDelete={(_, l) => void askDelete(l)} />
      )}

      {renaming ? (
        <Modal title={`Rename ${word}`} description={`"${renaming.name}" is used by ${renaming.count} ${renaming.count === 1 ? "template" : "templates"}.`} onClose={() => setRenaming(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const next = String(new FormData(form).get("name") ?? "").trim();
              if (!next || working) return;
              if (next === renaming.name) return void form.closest("dialog")?.close();
              const ok = await run(() => (kind === "category" ? renameCategory(renaming.id, next) : renameTag(renaming.id, next)));
              if (ok) form.closest("dialog")?.close();
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name
              <input name="name" defaultValue={renaming.name} maxLength={40} required autoFocus onFocus={(e) => e.currentTarget.select()} className={input} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.close()} className="h-9 rounded-lg border border-red-600 bg-red-600 text-white hover:bg-red-700 px-3 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={working} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60">Save</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
