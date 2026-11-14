"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Shared by the tools in the bottom left corner of a 3D view (Camera view, Shadow): each is an icon that expands a strip
 * to its right, the items sliding in one by one, and out again in reverse when it closes (`cv-*` classes in globals.css).
 * The parent must be `relative` and hold the 3D canvas.
 */

/** How long closing takes for a strip of `count` items (the last item leaves first, then the frame closes). Keep in step with globals.css. */
export const stripCloseMs = (count: number) => count * 40 + 360;

/** Distance (px) from the bottom of the parent to the bottom of its 3D canvas, plus a margin: a control bar under the picture is skipped. */
export function useCanvasBottom(box: React.RefObject<HTMLElement | null>): number {
  const [bottom, setBottom] = useState(8);
  useEffect(() => {
    // The canvas is added by the 3D view's own effect, which runs before this one (it comes first in the parent).
    const parent = box.current?.parentElement;
    const canvas = parent?.querySelector("canvas");
    if (!parent || !canvas) return;
    const measure = () => setBottom(Math.max(0, Math.round(parent.getBoundingClientRect().bottom - canvas.getBoundingClientRect().bottom)) + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [box]);
  return bottom;
}

/**
 * Open / closed state of such a strip. `open` is what the user wants; `shown` keeps the strip on screen while it plays its closing
 * motion. A click outside (or Escape) closes it, so opening one tool closes the other.
 */
export function useStrip(count: number) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);
  const closeMs = stripCloseMs(count);
  const toggle = useCallback(
    (next: boolean) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setOpen(next);
      if (next) setShown(true);
      else
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setShown(false);
        }, closeMs);
    },
    [closeMs],
  );
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) toggle(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      toggle(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, toggle]);
  return { box, open, shown, toggle };
}

/** Class and animation delay of item `i` of `count`: in from the left one by one while opening, out last-first while closing. */
export function stripItem(open: boolean, i: number, count: number): { className: string; style: CSSProperties } {
  return { className: open ? "cv-item" : "cv-item-out", style: { animationDelay: open ? `${80 + i * 55}ms` : `${(count - 1 - i) * 40}ms` } };
}

/** The frame of the strip: classes for its opening / closing motion. */
export const stripFrame = (open: boolean) => `${open ? "cv-strip" : "cv-strip-out"} absolute left-12 z-20 flex max-w-[calc(100%-3.5rem)] items-center gap-0.5 overflow-x-auto rounded-lg border bg-background/95 p-0.5 shadow-lg backdrop-blur`;
