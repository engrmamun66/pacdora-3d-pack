"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

/**
 * A small help icon for a corner of its (relatively positioned) parent. A click opens a short note;
 * the icon again, Esc, or a click outside closes it.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="absolute top-2 right-2 z-10">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        title="Help"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="grid size-7 place-items-center rounded-full border bg-background text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CircleHelp className="size-4" aria-hidden />
      </button>
      {open ? (
        <div id={id} role="note" className="absolute top-9 right-0 w-64 rounded-xl border bg-background p-3 text-xs leading-relaxed text-muted-foreground shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  );
}
