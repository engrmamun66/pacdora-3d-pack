"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/** A select with a search box (like select2): type to narrow the list, arrow keys and Enter to choose. */
export function SearchSelect({ label, value, options, onChange, required = false, placeholder = "Choose" }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.toLowerCase().includes(n)) : options;
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={box} className="relative flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</label>
      <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" onClick={() => { setOpen((o) => !o); setAt(0); }} className="flex h-10 items-center justify-between rounded-lg border bg-background px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={value ? "" : "text-muted-foreground"}>{value || placeholder}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div className="absolute top-full z-30 mt-1 w-full rounded-lg border bg-background p-1 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setAt(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(shown.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); if (shown[at]) pick(shown[at]); }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            }}
            placeholder="Type to search"
            aria-label={`Search ${label}`}
            className="mb-1 h-9 w-full rounded-md border bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-56 overflow-auto">
            {shown.length === 0 ? <li className="px-2 py-2 text-muted-foreground">Nothing found.</li> : null}
            {shown.map((o, i) => (
              <li key={o} role="option" aria-selected={o === value}>
                <button type="button" onClick={() => pick(o)} onMouseEnter={() => setAt(i)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${i === at ? "bg-muted" : ""}`}>
                  {o}
                  {o === value ? <Check className="size-4" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
