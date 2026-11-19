"use client";

import { createContext, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2, X } from "lucide-react";
import { deleteClientProjects } from "@/app/doraadmin/client-project-actions";
import { confirmAction } from "@/lib/confirm";
import { notify } from "@/lib/notify";
import type { ProjectLink } from "./client-project-actions";

interface Bulk {
  /** Every project on this page, in the order shown. */
  ids: string[];
  selected: Set<string>;
  toggle: (id: string, shift: boolean) => void;
  setAll: (on: boolean) => void;
}

const Ctx = createContext<Bulk | null>(null);
const useBulk = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("Bulk selection used outside its provider.");
  return c;
};

/**
 * Selection for the table of client projects: a checkbox per row (shift + click picks a whole stretch), one in the header
 * for the whole page, and a bar of actions that shows while something is picked. Rows that leave the page (another page,
 * another filter) drop out of the selection.
 */
export function BulkProvider({ ids, links, children }: { ids: string[]; links: Record<string, ProjectLink[]>; children: ReactNode }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const last = useRef<string | null>(null);
  const selected = useMemo(() => new Set(ids.filter((i) => picked.has(i))), [ids, picked]);

  const value: Bulk = {
    ids,
    selected,
    toggle: (id, shift) => {
      setPicked((prev) => {
        const next = new Set(ids.filter((i) => prev.has(i)));
        const from = last.current ? ids.indexOf(last.current) : -1;
        const at = ids.indexOf(id);
        if (shift && from >= 0 && at >= 0) {
          const on = !next.has(id);
          for (const i of ids.slice(Math.min(from, at), Math.max(from, at) + 1)) {
            if (on) next.add(i);
            else next.delete(i);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      last.current = id;
    },
    setAll: (on) => setPicked(on ? new Set(ids) : new Set()),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <BulkBar links={links} />
    </Ctx.Provider>
  );
}

const box = "size-4 cursor-pointer accent-foreground";

/** The checkbox in the table header: picks or clears the whole page. */
export function HeaderCheck() {
  const { ids, selected, setAll } = useBulk();
  const all = ids.length > 0 && selected.size === ids.length;
  return (
    <input
      type="checkbox"
      aria-label="Select all projects on this page"
      title="Select all on this page"
      className={box}
      disabled={ids.length === 0}
      checked={all}
      ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !all; }}
      onChange={() => setAll(!all)}
    />
  );
}

/** The checkbox of one row. Shift + click picks everything between this and the last one clicked. */
export function RowCheck({ id, name }: { id: string; name: string }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      data-row-check
      aria-label={`Select ${name}`}
      className={box}
      checked={selected.has(id)}
      onChange={() => undefined}
      onClick={(e) => toggle(id, e.shiftKey)}
    />
  );
}

function BulkBar({ links }: { links: Record<string, ProjectLink[]> }) {
  const router = useRouter();
  const { selected, setAll } = useBulk();
  const [pending, start] = useTransition();
  const menu = useRef<HTMLDetailsElement>(null);
  const n = selected.size;
  if (n === 0) return null;

  // One entry per kind of link that the picked projects have.
  const kinds = [...new Set([...selected].flatMap((id) => (links[id] ?? []).map((l) => l.label)))];
  const copy = async (kind: string) => {
    if (menu.current) menu.current.open = false;
    const urls = [...selected].flatMap((id) => (links[id] ?? []).filter((l) => l.label === kind).map((l) => `${window.location.origin}${l.path}`));
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      notify.success(`${urls.length} ${kind.toLowerCase()} ${urls.length === 1 ? "link" : "links"} copied, one per line.`);
    } catch {
      notify.error("The links could not be copied.");
    }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: `Delete ${n} ${n === 1 ? "project" : "projects"}?`, description: "The clients' projects are deleted, with their 3D pictures and share links. This cannot be undone.", confirmLabel: `Delete ${n}` }))) return;
    start(async () => {
      try {
        const r = await deleteClientProjects([...selected]);
        if (r.ok) {
          notify.success(r.message);
          setAll(false);
          router.refresh();
        } else notify.error(r.message);
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });
  };

  return (
    <div role="region" aria-label="Bulk actions" className="sticky bottom-3 z-20 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-t-[#444444] bg-card px-3 py-2 shadow-[0_-6px_20px_-4px_rgba(0,0,0,0.28)]">
      <span className="text-sm font-medium tabular-nums" aria-live="polite">{n} selected</span>
      <details ref={menu} className="relative">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[0.8rem] font-medium text-white hover:bg-neutral-800"><Link2 className="size-3.5" aria-hidden /> Copy links</summary>
        <div className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => void copy(k)} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">Copy {k.toLowerCase()} links</button>
          ))}
        </div>
      </details>
      <button type="button" disabled={pending} onClick={() => void remove()} className="flex h-8 items-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-3 text-[0.8rem] font-medium text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="size-3.5" aria-hidden /> Delete selected</button>
      <button type="button" onClick={() => setAll(false)} aria-label="Clear the selection" title="Clear the selection" className="grid size-8 place-items-center rounded-lg border hover:bg-muted"><X className="size-4" aria-hidden /></button>
    </div>
  );
}
