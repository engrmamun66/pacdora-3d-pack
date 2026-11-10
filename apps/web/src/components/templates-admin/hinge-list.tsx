"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { FoldHingeSpec } from "@packaging/dieline-engine";

const field = "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const COLS = "grid grid-cols-[2.25rem_minmax(9rem,1fr)_6.5rem_6rem_minmax(12rem,1.2fr)] items-center";
const SETTLE_MS = 180;

type Drag = {
  id: string;
  from: number;
  over: number;
  dy: number;
  settling: boolean;
  /** Row positions measured when the drag started (px, inside the list). */
  tops: number[];
  heights: number[];
};

const sign = (h: FoldHingeSpec) => (h.angleDeg < 0 ? -1 : 1);

/**
 * The fold lines in the order they happen. Grab the handle on the left and drag a row to
 * change the order: the other rows slide out of the way, and the step numbers are renumbered
 * on drop. The handle also works with the arrow keys.
 */
export function HingeList({
  hinges,
  label,
  selectedId,
  onSelect,
  onSetHinge,
  onMove,
}: {
  /** Already sorted by step. */
  hinges: readonly FoldHingeSpec[];
  label: (panelId: string) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSetHinge: (id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>) => void;
  /** Move the line to this position (0-based). */
  onMove: (id: string, toIndex: number) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const startY = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const begin = (e: PointerEvent<HTMLButtonElement>, id: string, from: number) => {
    if (e.button !== 0 || drag) return;
    const els = hinges.map((h) => rows.current.get(h.id));
    if (els.some((el) => !el)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    setDrag({ id, from, over: from, dy: 0, settling: false, tops: els.map((el) => el!.offsetTop), heights: els.map((el) => el!.offsetHeight) });
    onSelect(id);
  };

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.settling) return;
    const { from, tops, heights } = drag;
    const last = hinges.length - 1;
    const minDy = tops[0]! - tops[from]!;
    const maxDy = tops[last]! + heights[last]! - heights[from]! - tops[from]!;
    const dy = Math.min(maxDy, Math.max(minDy, e.clientY - startY.current));
    const center = tops[from]! + dy + heights[from]! / 2;
    let over = from;
    for (let j = 0; j < hinges.length; j++) {
      const mid = tops[j]! + heights[j]! / 2;
      if (j > from && center >= mid) over = Math.max(over, j);
      if (j < from && center <= mid) over = Math.min(over, j);
    }
    // Rows differ by a pixel or so (the last has no bottom border): at the ends of the list, go all the way.
    if (dy >= maxDy - 2) over = last;
    else if (dy <= minDy + 2) over = 0;
    setDrag({ ...drag, dy, over });
  };

  const end = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.settling) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const { id, from, over, tops, heights } = drag;
    const slot = over > from ? tops[over]! + heights[over]! - heights[from]! - tops[from]! : over < from ? tops[over]! - tops[from]! : 0;
    setDrag({ ...drag, dy: slot, settling: true });
    timer.current = setTimeout(() => {
      timer.current = null;
      setDrag(null);
      if (over !== from) onMove(id, over);
    }, SETTLE_MS);
  };

  const keys = (e: KeyboardEvent<HTMLButtonElement>, id: string, i: number) => {
    if (e.key === "ArrowUp" && i > 0) onMove(id, i - 1);
    else if (e.key === "ArrowDown" && i < hinges.length - 1) onMove(id, i + 1);
    else return;
    e.preventDefault();
    onSelect(id);
  };

  const shiftOf = (i: number): number => {
    if (!drag) return 0;
    const h = drag.heights[drag.from]!;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -h;
    if (drag.from > drag.over && i >= drag.over && i < drag.from) return h;
    return 0;
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[620px]">
        <div className={`${COLS} gap-x-1 border-b bg-muted/40 px-1 py-2 text-xs font-medium text-muted-foreground`}>
          <span className="sr-only">Drag to reorder</span>
          <span aria-hidden />
          <span className="px-1">Fold (stays → swings)</span>
          <span className="px-1">Step</span>
          <span className="px-1">Angle</span>
          <span className="px-1">Direction</span>
        </div>
        <ul aria-label="Fold lines, in folding order" className="relative">
          {hinges.map((h, i) => {
            const dragging = drag?.id === h.id;
            const selected = selectedId === h.id;
            const style = dragging
              ? { transform: `translateY(${drag.dy}px)`, transition: drag.settling ? `transform ${SETTLE_MS}ms ease-out` : "none" }
              : { transform: `translateY(${shiftOf(i)}px)`, transition: drag ? `transform ${SETTLE_MS}ms ease-out` : "none" };
            return (
              <li
                key={h.id}
                ref={(el) => {
                  if (el) rows.current.set(h.id, el);
                  else rows.current.delete(h.id);
                }}
                style={style}
                className={`${COLS} relative gap-x-1 border-b bg-background px-1 py-1.5 last:border-b-0 motion-reduce:!transition-none ${selected ? "bg-primary/5" : ""} ${dragging ? "z-10 rounded-lg border shadow-lg ring-2 ring-primary/40" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Move ${label(h.parentId)} to ${label(h.childId)} in the folding order. Drag, or use the up and down arrow keys. Now step ${h.order}, position ${i + 1} of ${hinges.length}.`}
                  title="Drag to change the folding order"
                  className={`grid size-8 touch-none select-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                  onPointerDown={(e) => begin(e, h.id, i)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onKeyDown={(e) => keys(e, h.id, i)}
                >
                  <GripVertical className="size-4" aria-hidden />
                </button>
                <button type="button" className="px-1 text-left text-sm hover:underline" onClick={() => onSelect(h.id)}>
                  {label(h.parentId)} <span className="text-muted-foreground">→</span> {label(h.childId)}
                </button>
                <span className="flex items-center gap-1 px-1">
                  <button type="button" aria-label={`Fold ${label(h.childId)} earlier`} className="grid size-6 place-items-center rounded border hover:bg-muted disabled:opacity-40" disabled={h.order <= 1} onClick={() => onSetHinge(h.id, { order: h.order - 1 })}><ChevronUp className="size-3.5" /></button>
                  <span className="w-5 text-center tabular-nums">{h.order}</span>
                  <button type="button" aria-label={`Fold ${label(h.childId)} later`} className="grid size-6 place-items-center rounded border hover:bg-muted" onClick={() => onSetHinge(h.id, { order: h.order + 1 })}><ChevronDown className="size-3.5" /></button>
                </span>
                <span className="px-1">
                  <input
                    aria-label={`Angle of ${label(h.parentId)} to ${label(h.childId)}`}
                    className={`${field} w-16`}
                    type="number"
                    min={1}
                    max={180}
                    step={1}
                    value={Math.abs(h.angleDeg)}
                    onChange={(e) => {
                      const v = Math.min(180, Math.max(1, Math.round(Number(e.target.value) || 90)));
                      onSetHinge(h.id, { angleDeg: sign(h) * v });
                    }}
                  />
                  <span className="ml-1 text-xs text-muted-foreground">°</span>
                </span>
                <span className="px-1">
                  <select aria-label={`Direction of ${label(h.parentId)} to ${label(h.childId)}`} className={`${field} w-full`} value={sign(h)} onChange={(e) => onSetHinge(h.id, { angleDeg: Number(e.target.value) * Math.abs(h.angleDeg) })}>
                    <option value={1}>Inward (print stays outside)</option>
                    <option value={-1}>Outward (reverse)</option>
                  </select>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
