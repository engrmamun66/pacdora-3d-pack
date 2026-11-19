"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** What a row gets to build its content: the props of its drag handle, and whether it is being dragged now. */
export interface SortableRowState {
  handleProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    style: CSSProperties;
  };
  dragging: boolean;
  index: number;
}

interface Drag {
  id: string;
  from: number;
  over: number;
  dy: number;
  /** Top and height of every row when the drag began, and the space between rows. */
  tops: number[];
  heights: number[];
  gap: number;
  /** The row is sliding into its new place after the mouse was let go. */
  settling: boolean;
}

const SLIDE_MS = 200;

/**
 * A vertical list the person can re-order by dragging a handle (mouse, touch or pen). Rows glide out of the way while one is
 * dragged, the dragged row slides into its place when let go, and any other re-ordering (buttons, a new list) glides too.
 * `onReorder` gets the new order of ids.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  label,
  className,
  itemClass,
  renderItem,
  empty,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  label: string;
  className?: string;
  itemClass?: (item: T, dragging: boolean) => string;
  renderItem: (item: T, state: SortableRowState) => ReactNode;
  empty?: ReactNode;
}) {
  const list = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const skipGlide = useRef(false);
  const lastTops = useRef(new Map<string, number>());

  // Rows that changed place (not by a drag) glide from where they were to where they are now.
  const order = items.map((i) => i.id).join(",");
  useLayoutEffect(() => {
    const base = list.current?.getBoundingClientRect().top ?? 0;
    const now = new Map<string, number>();
    rows.current.forEach((el, id) => now.set(id, el.getBoundingClientRect().top - base));
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!skipGlide.current && !calm) {
      lastTops.current.forEach((top, id) => {
        const to = now.get(id);
        const el = rows.current.get(id);
        if (el && to !== undefined && Math.abs(top - to) > 1) el.animate([{ transform: `translateY(${top - to}px)` }, { transform: "translateY(0)" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }
    skipGlide.current = false;
    lastTops.current = now;
  }, [order]);

  const begin = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const from = items.findIndex((i) => i.id === id);
    const els = items.map((i) => rows.current.get(i.id));
    if (from < 0 || els.some((x) => !x)) return;
    const rects = els.map((x) => x!.getBoundingClientRect());
    const gap = rects.length > 1 ? Math.max(0, rects[1]!.top - rects[0]!.bottom) : 0;
    e.preventDefault();
    const startY = e.clientY;
    // The state of the drag as the listeners below see it (they outlive this render).
    let cur: Drag = { id, from, over: from, dy: 0, tops: rects.map((r) => r.top), heights: rects.map((r) => r.height), gap, settling: false };
    const update = (d: Drag | null) => {
      if (d) cur = d;
      setDrag(d);
    };
    update(cur);

    const move = (ev: PointerEvent) => {
      const d = cur;
      if (d.settling) return;
      const lo = d.tops[0]! - d.tops[d.from]!;
      const hi = d.tops[d.tops.length - 1]! + d.heights[d.heights.length - 1]! - (d.tops[d.from]! + d.heights[d.from]!);
      const dy = Math.min(hi, Math.max(lo, ev.clientY - startY));
      const centre = d.tops[d.from]! + d.heights[d.from]! / 2 + dy;
      let over = 0;
      d.tops.forEach((t, j) => {
        if (j !== d.from && centre > t + d.heights[j]! / 2) over++;
      });
      update({ ...d, dy, over });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const d = cur;
      if (d.settling) return;
      // Slide the row into its slot, then change the order (no second glide: the rows are already there).
      const slot = d.over === d.from ? 0 : d.tops[d.over]! - d.tops[d.from]!;
      update({ ...d, dy: slot, settling: true });
      window.setTimeout(() => {
        const ids = items.map((i) => i.id);
        const [moved] = ids.splice(d.from, 1);
        ids.splice(d.over, 0, moved!);
        if (d.over !== d.from) {
          skipGlide.current = true;
          onReorder(ids);
        }
        update(null);
      }, SLIDE_MS);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const shift = (i: number): number => {
    if (!drag || i === drag.from) return 0;
    const step = drag.heights[drag.from]! + drag.gap;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -step; // moving down: the rows passed move up
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return step; // moving up: the rows passed move down
    return 0;
  };

  return (
    <ol ref={list} aria-label={label} className={className}>
      {/* The handle's begin() and the row refs are only used on pointer events and by React's ref callback, never read while rendering. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {items.map((item, i) => {
        const dragging = drag?.id === item.id;
        const dy = dragging ? drag!.dy : shift(i);
        const style: CSSProperties = {
          position: "relative",
          zIndex: dragging ? 20 : undefined,
          transform: drag ? `translateY(${dy}px)` : undefined,
          transition: drag && (!dragging || drag.settling) ? `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1)` : "none",
          boxShadow: dragging && !drag!.settling ? "0 8px 24px -6px rgba(0,0,0,.25)" : undefined,
        };
        return (
          <li
            key={item.id}
            ref={(el) => {
              if (el) rows.current.set(item.id, el);
              else rows.current.delete(item.id);
            }}
            style={style}
            className={itemClass?.(item, dragging) ?? ""}
          >
            {renderItem(item, { dragging, index: i, handleProps: { onPointerDown: (e) => begin(item.id, e), style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" } } })}
          </li>
        );
      })}
      {items.length === 0 ? empty : null}
    </ol>
  );
}
