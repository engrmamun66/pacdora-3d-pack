"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirm";
import { notify } from "@/lib/notify";
import { SAMPLE_BOXES } from "@/lib/sample-boxes";
import { createLayoutDesign, deleteLayoutDesign, renameLayoutDesign } from "@/app/doraadmin/template-layout-actions";
import type { LayoutDesignItem } from "@/server/layouts";

const input = "h-8 rounded-md border border-input bg-background px-2 text-sm";
const boxLabel = (id: string) => SAMPLE_BOXES.find((b) => b.id === id)?.label ?? id;

/**
 * "Designs": the super admin makes custom designs for the layout icons. A design is made in the online design editor (the same page
 * customers use: artwork, backgrounds, colours) on the sample box, in a big box over this page. One is picked to dress the sample box all
 * layout icons and the preview are drawn with; `onUse` does that (it redraws the saved icons).
 */
export function LayoutDesignsDialog({ designs, activeId, boxId, disabled, onUse, onEdited }: { designs: LayoutDesignItem[]; activeId: string | null; boxId: string; disabled?: boolean; onUse: (d: LayoutDesignItem) => void; onEdited: () => void }) {
  const router = useRouter();
  const list = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; projectId: string } | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  const edit = (d: { id: string; name: string; projectId: string }) => {
    setEditing(d);
    editor.current?.showModal();
  };

  const create = () =>
    start(async () => {
      try {
        const r = await createLayoutDesign({ name, boxId });
        if (!r.ok || !r.id || !r.projectId) return void notify.error(r.message);
        setName("");
        router.refresh();
        edit({ id: r.id, name: name.trim(), projectId: r.projectId });
      } catch {
        notify.error("Could not create the design.");
      }
    });

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { setListOpen(true); list.current?.showModal(); }} title="Make custom designs for the icons">
        <Palette className="size-3.5" /> Designs ({designs.length})
      </Button>

      <dialog
        ref={list}
        aria-label="Custom designs for the layout icons"
        onClose={() => setListOpen(false)}
        onClick={(e) => e.target === e.currentTarget && list.current?.close()}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50"
      >
        {listOpen ? (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Designs for the icons</h2>
                <p className="text-sm text-muted-foreground">Make a design in the online design editor, on the sample box. Pick one to draw all layout icons, and the preview, with it.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => list.current?.close()}>Close</Button>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium">
                New design, on the {boxLabel(boxId)}
                <input className={input} value={name} maxLength={40} placeholder="e.g. Kraft pattern" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && !pending && create()} />
              </label>
              <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={create}><Plus className="size-3.5" /> Create and design</Button>
            </div>

            {designs.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No designs yet. Name one above to open the editor.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Designs">
                {designs.map((d) => (
                  <DesignRow
                    key={`${d.id}-${d.name}`}
                    design={d}
                    active={d.id === activeId}
                    pending={pending}
                    onEdit={() => edit(d)}
                    onUse={() => onUse(d)}
                    onRename={(n) => start(async () => {
                      const r = await renameLayoutDesign({ id: d.id, name: n }).catch(() => ({ ok: false, message: "Could not save." }));
                      if (!r.ok) notify.error(r.message);
                      else router.refresh();
                    })}
                    onDelete={async () => {
                      if (!(await confirmAction({ title: `Delete "${d.name}"?`, description: "The design and its artwork are removed. Icons already drawn with it stay as they are." }))) return;
                      start(async () => {
                        const r = await deleteLayoutDesign(d.id).catch(() => ({ ok: false, message: "Could not delete." }));
                        if (!r.ok) notify.error(r.message);
                        else router.refresh();
                      });
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </dialog>

      {/* The online design editor (the same page as for customers), in a big box. Its work is saved by itself. */}
      <dialog
        ref={editor}
        aria-label="Design editor"
        onClose={() => {
          setEditing(null);
          onEdited();
        }}
        className="m-auto h-[96dvh] w-[98vw] max-w-none overflow-hidden rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
      >
        {editing ? (
          <div className="flex size-full flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
              <span className="font-medium">Design: {editing.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Everything is saved as you work. Close when you are done, then use it for the icons.</span>
              <Button type="button" size="sm" onClick={() => editor.current?.close()}>Done</Button>
            </div>
            <iframe src={`/editor/${editing.projectId}?embed=1`} title="Design editor" className="min-h-0 w-full flex-1 bg-background" />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function DesignRow({ design, active, pending, onEdit, onUse, onRename, onDelete }: { design: LayoutDesignItem; active: boolean; pending: boolean; onEdit: () => void; onUse: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(design.name);
  const dirty = name.trim() !== design.name && name.trim().length > 0;
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${active ? "border-foreground bg-accent/50" : ""}`}>
      <div className="flex min-w-40 flex-1 flex-col gap-0.5">
        <input className={input} aria-label="Design name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => dirty && onRename(name.trim())} onKeyDown={(e) => e.key === "Enter" && dirty && onRename(name.trim())} />
        <span className="px-1 text-[11px] text-muted-foreground">{boxLabel(design.boxId)}{active ? " · in use" : ""}</span>
      </div>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
        <Button type="button" size="sm" variant={active ? "outline" : "default"} disabled={pending || dirty} onClick={onUse} title="Draw all icons and the preview with this design">
          {active ? "Redraw icons" : "Use for all icons"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending || active} onClick={onDelete} title={active ? "In use: choose another style first" : "Delete this design"} aria-label={`Delete ${design.name}`}><Trash2 className="size-3.5" /></Button>
      </div>
    </li>
  );
}
