"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Tooltips with no waiting, for the whole app: any element with a `data-tip="text"` shows its text at once when the pointer is on it (or it has
 * the keyboard focus), above it with an arrow pointing at it, or below when there is no room. A browser's own `title` tooltip waits a second or
 * two, so a `title` is taken over here: on first hover it becomes a `data-tip` (and the browser's own tooltip is gone).
 * Mounted once in the root layout; it is a fixed layer, so no clipping parent (a scrolling strip, an animated frame) can cut it off.
 */
export function InstantTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const el = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Keep the tooltip inside the window; the arrow keeps pointing at the element.
  useLayoutEffect(() => {
    const d = box.current;
    if (!d || !tip) return;
    const w = d.offsetWidth;
    const left = Math.max(6, Math.min(tip.x - w / 2, window.innerWidth - w - 6));
    d.style.left = `${left}px`;
    const arrow = d.firstElementChild as HTMLElement | null;
    if (arrow) arrow.style.left = `${Math.max(8, Math.min(tip.x - left, w - 8))}px`;
  }, [tip]);

  useEffect(() => {
    const show = (target: EventTarget | null) => {
      let t = target instanceof Element ? target.closest<HTMLElement>("[data-tip], [title]") : null;
      if (t && !t.dataset.tip) {
        // Take over a plain title: the text moves to data-tip, so only this tooltip shows.
        const own = t.getAttribute("title")?.trim();
        t.removeAttribute("title");
        if (!own) t = null;
        else t.dataset.tip = own;
      }
      if (t === el.current) return;
      el.current = t;
      const text = t?.dataset.tip;
      if (!t || !text) return setTip(null);
      const r = t.getBoundingClientRect();
      const below = r.top < 44;
      setTip({ text, x: Math.round(r.left + r.width / 2), y: Math.round(below ? r.bottom : r.top), below });
    };
    const hide = () => {
      el.current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => show(e.target);
    const focus = (e: FocusEvent) => e.target instanceof HTMLElement && e.target.matches(":focus-visible") && show(e.target);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", hide, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      style={{ left: tip.x, top: tip.y, transform: `translateY(${tip.below ? "8px" : "calc(-100% - 8px)"})` }}
      className="pointer-events-none fixed z-[100] max-w-72 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] leading-snug font-medium text-white shadow-lg"
    >
      <span aria-hidden className={`absolute size-1.5 -translate-x-1/2 rotate-45 bg-neutral-800 ${tip.below ? "-top-[3px]" : "-bottom-[3px]"}`} />
      {tip.text}
    </div>
  );
}
