"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCategory, deleteCategory, updateCategory } from "@/app/doraadmin/template-category-actions";
import { notify } from "@/lib/notify";
import { slugify } from "@/lib/slug";

export interface CategoryRow {
  id: string;
  kind: "use" | "model";
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  templateCount: number;
}

const input = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** List, add, edit and delete the categories of one group (By uses or By models). */
export function CategoryManager({ kind, rows }: { kind: "use" | "model"; rows: CategoryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", slug: "", sortOrder: 0, active: true });
  const [adding, setAdding] = useState({ name: "", slug: "", sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 10 });

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          notify.success(r.message);
          after?.();
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });

  const startEdit = (r: CategoryRow) => {
    setEditing(r.id);
    setDraft({ name: r.name, slug: r.slug, sortOrder: r.sortOrder, active: r.active });
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createCategory({ kind, ...adding }), () => setAdding({ name: "", slug: "", sortOrder: adding.sortOrder + 10 }));
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium">
          Name
          <input className={`${input} w-56`} value={adding.name} maxLength={60} required onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Slug (optional)
          <input className={`${input} w-48 font-mono`} value={adding.slug} placeholder={slugify(adding.name) || "auto"} maxLength={80} onChange={(e) => setAdding({ ...adding, slug: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Order
          <input className={`${input} w-24`} type="number" min={0} value={adding.sortOrder} onChange={(e) => setAdding({ ...adding, sortOrder: Number(e.target.value) })} />
        </label>
        <Button type="submit" className="h-9" disabled={pending}><Plus className="size-4" aria-hidden /> Add category</Button>
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Order</th>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Slug</th>
              <th scope="col" className="px-3 py-2 font-medium">Templates</th>
              <th scope="col" className="px-3 py-2 font-medium">Visible</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              editing === r.id ? (
                <tr key={r.id} className="border-b bg-muted/20 last:border-0">
                  <td className="px-3 py-2"><input aria-label="Order" className={`${input} w-20`} type="number" min={0} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></td>
                  <td className="px-3 py-2"><input aria-label="Name" className={`${input} w-48`} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                  <td className="px-3 py-2"><input aria-label="Slug" className={`${input} w-44 font-mono`} value={draft.slug} maxLength={80} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></td>
                  <td className="px-3 py-2 tabular-nums">{r.templateCount}</td>
                  <td className="px-3 py-2"><input aria-label="Visible" type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label="Save" disabled={pending} className="grid size-8 place-items-center rounded-md border hover:bg-muted" onClick={() => run(() => updateCategory({ id: r.id, kind, ...draft }), () => setEditing(null))}><Check className="size-4" /></button>
                      <button type="button" aria-label="Cancel" className="grid size-8 place-items-center rounded-md border hover:bg-muted" onClick={() => setEditing(null)}><X className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.sortOrder}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                  <td className="px-3 py-2 tabular-nums">{r.templateCount}</td>
                  <td className="px-3 py-2">{r.active ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Visible</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Hidden</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label={`Edit ${r.name}`} className="grid size-8 place-items-center rounded-md border hover:bg-muted" onClick={() => startEdit(r)}><Pencil className="size-4" /></button>
                      <button
                        type="button"
                        aria-label={`Delete ${r.name}`}
                        disabled={pending}
                        className="grid size-8 place-items-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (window.confirm(`Delete "${r.name}"?${r.templateCount ? ` ${r.templateCount} template(s) will be kept but removed from this category.` : ""}`)) run(() => deleteCategory(r.id));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No categories yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
