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

/**
 * A small help icon that sits inline, next to a heading, label or button. A click opens the note in a
 * popup beside it (fixed, so a scrolling panel cannot clip it); the icon again, Esc, a click elsewhere
 * or scrolling closes it. Use it instead of a line of explanation under a field.
 */
export function InfoTip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!box) return;
    const close = () => setBox(null);
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!note.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault(); // so an open panel popup behind it stays open
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [box]);
  const toggle = () => {
    if (box) return setBox(null);
    const r = btn.current?.getBoundingClientRect();
    if (r) setBox({ left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 328)), top: r.bottom + 6 });
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Help: ${label}`}
        aria-expanded={box !== null}
        aria-controls={box ? id : undefined}
        title="Help"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggle();
        }}
        className={`inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${className}`}
      >
        <CircleHelp className="size-4" aria-hidden />
      </button>
      {box ? (
        <span ref={note} id={id} role="note" style={{ position: "fixed", left: box.left, top: box.top, width: 320, maxWidth: "calc(100vw - 16px)" }} className="z-[60] block rounded-xl border bg-popover p-3 text-xs leading-relaxed font-normal text-popover-foreground shadow-lg">
          {children}
        </span>
      ) : null}
    </>
  );
}
