"use client";

import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** A row of cards that scrolls sideways: swipe it, or use the two arrow buttons. */
export function RowScroller({ children, label }: { children: ReactNode; label: string }) {
  const row = useRef<HTMLUListElement>(null);
  const by = (dir: -1 | 1) => row.current?.scrollBy({ left: dir * Math.max(280, row.current.clientWidth * 0.8), behavior: "smooth" });
  const btn = "grid size-10 place-items-center rounded-full border bg-card shadow-xs transition-colors hover:border-[var(--crease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  return (
    <div className="flex flex-col gap-4">
      <ul ref={row} aria-label={label} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-1 pb-4 sm:-mx-6 sm:px-6">
        {children}
      </ul>
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={() => by(-1)} aria-label="Scroll back"><ArrowLeft className="size-4" aria-hidden /></button>
        <button type="button" className={btn} onClick={() => by(1)} aria-label="Scroll on"><ArrowRight className="size-4" aria-hidden /></button>
      </div>
    </div>
  );
}
