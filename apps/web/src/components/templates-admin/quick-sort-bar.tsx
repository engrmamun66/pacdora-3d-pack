"use client";

import { useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_H = 100;

export interface QuickItem {
  id: string;
  label: string;
}

/**
 * Quick sort bar, stuck to the bottom of the window while the fold editor is on screen.
 * The fold lines the admin clicked appear here in click order (1, 2, 3...). Drag a chip to
 * change the order (or focus it and press Alt + arrow keys), press x to drop it, Apply to use it.
 */
export function QuickSortBar({
  items,
  onReorder,
  onRemove,
  onClear,
  onApply,
  onCancel,
  bottom,
}: {
  items: QuickItem[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
  /** Distance from the window bottom (CSS length), so the bar clears a sticky save bar. */
  bottom: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  // Height of the bar. The grip at the top centre makes it taller (as tall as the window allows) so more chips show at once.
  const [height, setHeight] = useState(MIN_H);
  const grip = useRef<{ y: number; h: number } | null>(null);
  const maxH = () => Math.max(MIN_H, window.innerHeight - 80);
  const resize = (h: number) => setHeight(Math.min(maxH(), Math.max(MIN_H, Math.round(h))));
  const expanded = height > MIN_H + 8;
  const ids = items.map((i) => i.id);

  const move = (id: string, to: number) => {
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || to === from) return;
    const next = ids.filter((x) => x !== id);
    next.splice(to, 0, id);
    onReorder(next);
  };

  return (
    <section
      aria-label="Quick sort"
      style={{ bottom, height }}
      className="sticky z-20 flex items-center gap-4 rounded-xl border bg-card px-4 shadow-lg ring-1 ring-black/5"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the quick sort bar"
        aria-valuemin={MIN_H}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag up or down to resize. Double-click to reset."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          grip.current = { y: e.clientY, h: height };
        }}
        onPointerMove={(e) => grip.current && resize(grip.current.h + (grip.current.y - e.clientY))}
        onPointerUp={() => (grip.current = null)}
        onPointerCancel={() => (grip.current = null)}
        onDoubleClick={() => setHeight(MIN_H)}
        onKeyDown={(e) => {
          const next = e.key === "ArrowUp" ? height + 24 : e.key === "ArrowDown" ? height - 24 : e.key === "Home" ? MIN_H : null;
          if (next === null) return;
          e.preventDefault();
          resize(next);
        }}
        className="group absolute -top-3 left-1/2 flex h-6 w-20 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full border bg-muted shadow-xs transition-colors group-hover:bg-primary/30 group-focus-visible:bg-primary/30" />
      </div>
      <div className="w-36 shrink-0">
        <h3 className="text-sm font-semibold">Quick sort</h3>
        <p className="text-xs text-muted-foreground">
          {items.length ? `${items.length} in order` : "Click the fold lines in the order they should fold."}
        </p>
      </div>

      {items.length ? (
        <ol className={`flex min-w-0 flex-1 gap-2 py-2 ${expanded ? "max-h-full flex-wrap content-start overflow-y-auto" : "items-center overflow-x-auto"}`} aria-label="Fold order. Drag to reorder, or press Alt and an arrow key.">
          {items.map((it, i) => (
            <li
              key={it.id}
              draggable
              onDragStart={(e) => {
                setDragId(it.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", it.id);
              }}
              onDragEnter={() => dragId && dragId !== it.id && move(dragId, i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => setDragId(null)}
              className={`flex shrink-0 cursor-grab items-center gap-1.5 rounded-lg border bg-background py-1.5 pr-1 pl-1.5 text-sm shadow-xs transition-opacity active:cursor-grabbing ${dragId === it.id ? "opacity-40" : ""}`}
            >
              <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground tabular-nums">{i + 1}</span>
              <button
                type="button"
                className="max-w-44 truncate rounded px-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                title={it.label}
                aria-label={`${i + 1}. ${it.label}. Alt plus arrow keys moves it.`}
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    move(it.id, i - 1);
                  } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    move(it.id, i + 1);
                  }
                }}
              >
                {it.label}
              </button>
              <button
                type="button"
                aria-label={`Remove ${it.label}`}
                onClick={() => onRemove(it.id)}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={!items.length} onClick={onClear}>Clear</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!items.length} onClick={onApply}>Apply</Button>
      </div>
    </section>
  );
}
