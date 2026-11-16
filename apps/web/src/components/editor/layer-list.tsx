"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Circle, Eye, EyeOff, ImagePlus, Link2, Lock, Slash, Square, Type, Unlock } from "lucide-react";
import type { ArtworkObject } from "@packaging/schema";

const TYPE_ICON = { text: Type, image: ImagePlus, rect: Square, ellipse: Circle, line: Slash } as const;
const LAYER_DRAG = "application/x-dieline-layer";
const SLIDE_MS = 240;

/** A colour for a group, the same on every render: its layers get a bar of it on the left. */
const groupColour = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 50%)`;
};

/**
 * The layer list (top layer first). A layer can be:
 * - chosen with a click, renamed with a double-click (Enter saves, Escape cancels),
 * - moved one step with the arrows, or dragged to any place in the list.
 * Layers of one group carry a coloured bar on the left; choosing one of them chooses the whole group.
 * When the order changes the rows slide to their new places instead of jumping.
 */
export function LayerList({
  layers,
  selected,
  onSelect,
  onVisible,
  onLock,
  onStep,
  onMoveTo,
  onRename,
}: {
  /** Top layer first. */
  layers: ArtworkObject[];
  selected: string[];
  onSelect: (id: string) => void;
  onVisible: (id: string, visible: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  /** Move one step: +1 up, -1 down. */
  onStep: (id: string, delta: number) => void;
  /** Move to a place in the stack, counted from the bottom (0 = bottom). */
  onMoveTo: (id: string, index: number) => void;
  onRename: (id: string, name: string) => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  // FLIP: remember where every row was, and after a change slide each moved row from its old place to the new one.
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    rows.current.forEach((el, id) => {
      const top = el.offsetTop;
      next.set(id, top);
      const was = tops.current.get(id);
      if (!reduced && was !== undefined && was !== top && typeof el.animate === "function") {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    });
    tops.current = next;
  });

  const commitRename = () => {
    if (editing) onRename(editing, draft);
    setEditing(null);
  };

  const drop = () => {
    if (!dragId || !over || dragId === over.id) return;
    const order = layers.map((l) => l.id).filter((id) => id !== dragId);
    const at = order.indexOf(over.id);
    if (at < 0) return;
    order.splice(over.after ? at + 1 : at, 0, dragId);
    // The list shows the top first, the stack counts from the bottom.
    onMoveTo(dragId, layers.length - 1 - order.indexOf(dragId));
  };

  return (
    <ul className="relative min-h-0 flex-[0.8_1_0] overflow-auto py-1" aria-label="Layers (top first)" onDragEnd={() => { setDragId(null); setOver(null); }}>
      {layers.length === 0 ? <li className="px-3 py-2 text-xs text-muted-foreground">No artwork yet.</li> : null}
      {layers.map((o, i) => {
        const Icon = TYPE_ICON[o.type];
        const isSel = selected.includes(o.id);
        const mark = over?.id === o.id && dragId !== o.id ? (over.after ? "shadow-[inset_0_-2px_0_var(--color-primary)]" : "shadow-[inset_0_2px_0_var(--color-primary)]") : "";
        return (
          <li
            key={o.id}
            ref={(el) => {
              if (el) rows.current.set(o.id, el);
              else rows.current.delete(o.id);
            }}
            style={o.groupId ? { borderLeft: `3px solid ${groupColour(o.groupId)}` } : undefined}
            draggable={editing !== o.id}
            onDragStart={(e) => {
              e.dataTransfer.setData(LAYER_DRAG, o.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(o.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const r = e.currentTarget.getBoundingClientRect();
              setOver({ id: o.id, after: e.clientY > r.top + r.height / 2 });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
              setDragId(null);
              setOver(null);
            }}
            className={`group flex items-center gap-1 px-2 py-1 text-xs ${isSel ? "bg-primary/10" : "hover:bg-muted"} ${dragId === o.id ? "opacity-40" : ""} ${mark}`}
          >
            {editing === o.id ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  aria-label={`Rename ${o.name}`}
                  value={draft}
                  maxLength={80}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") setEditing(null);
                  }}
                  className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-xs outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left active:cursor-grabbing"
                title="Click to select, double-click to rename, drag to reorder"
                onClick={() => onSelect(o.id)}
                onDoubleClick={() => {
                  onSelect(o.id);
                  setDraft(o.name);
                  setEditing(o.id);
                }}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={`truncate ${o.visible ? "" : "text-muted-foreground line-through"}`}>{o.name}</span>
                {o.groupId ? <Link2 className="size-3 shrink-0 text-muted-foreground" aria-label="In a group" /> : null}
              </button>
            )}
            <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100" title={o.visible ? "Hide" : "Show"} aria-label={o.visible ? `Hide ${o.name}` : `Show ${o.name}`} onClick={() => onVisible(o.id, !o.visible)}>
              {o.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
            <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100" title={o.locked ? "Unlock" : "Lock"} aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} onClick={() => onLock(o.id, !o.locked)}>
              {o.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
            </button>
            <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 disabled:opacity-20" title="Bring forward" aria-label={`Bring ${o.name} forward`} disabled={i === 0} onClick={() => onStep(o.id, 1)}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 disabled:opacity-20" title="Send backward" aria-label={`Send ${o.name} backward`} disabled={i === layers.length - 1} onClick={() => onStep(o.id, -1)}>
              <ArrowDown className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
