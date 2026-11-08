"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";

const inputCls =
  "h-7 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function FieldRow({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <label htmlFor={htmlFor} className="truncate text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Number input that commits on Enter or blur (not on every keystroke). */
export function NumberField({
  label,
  value,
  onCommit,
  step = 0.5,
  min,
  max,
  suffix,
  decimals = 2,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
}) {
  const id = useId();
  const fmt = (v: number) => String(Math.round(v * 10 ** decimals) / 10 ** decimals);
  const [text, setText] = useState(fmt(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    // The object changed elsewhere (drag, undo): show the new value.
    setPrev(value);
    setText(fmt(value));
  }
  const commit = () => {
    const v = Number(text);
    if (!Number.isFinite(v) || text.trim() === "") return setText(fmt(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (Math.abs(clamped - value) > 1e-9) onCommit(clamped);
    setText(fmt(clamped));
  };
  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="flex items-center gap-1">
        <input
          id={id}
          className={inputCls}
          inputMode="decimal"
          type="number"
          step={step}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setText(fmt(value));
          }}
        />
        {suffix ? <span className="w-6 text-[10px] text-muted-foreground">{suffix}</span> : null}
      </div>
    </FieldRow>
  );
}

export function TextField({ label, value, onCommit, multiline = false, maxLength }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; maxLength?: number }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const commit = () => text !== value && onCommit(text);
  return (
    <FieldRow label={label} htmlFor={id}>
      {multiline ? (
        <textarea id={id} className={`${inputCls} h-16 py-1`} value={text} maxLength={maxLength} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : (
        <input id={id} className={inputCls} value={text} maxLength={maxLength} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      )}
    </FieldRow>
  );
}

export function SelectField<T extends string>({ label, value, options, onCommit }: { label: string; value: T; options: readonly { value: T; label: string }[]; onCommit: (v: T) => void }) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <select id={id} className={inputCls} value={value} onChange={(e) => onCommit(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/**
 * Colour picker with an optional "none". Commits on the native change event
 * (when the picker closes), not on every drag step.
 */
export function ColorField({ label, value, onCommit, allowNone = false }: { label: string; value: string | null; onCommit: (v: string | null) => void; allowNone?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const onNativeChange = useEffectEvent((v: string) => onCommit(v));
  const isNone = value === null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => onNativeChange(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [isNone, value]);
  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        {value === null ? (
          <button type="button" className="h-7 flex-1 rounded-md border border-dashed text-xs text-muted-foreground" onClick={() => onCommit("#000000")}>
            None (add)
          </button>
        ) : (
          <>
            <input id={id} ref={ref} type="color" defaultValue={value} key={value} className="h-7 w-10 cursor-pointer rounded border border-input bg-background p-0.5" />
            <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
            {allowNone ? (
              <button type="button" className="ml-auto text-[11px] text-muted-foreground hover:underline" onClick={() => onCommit(null)}>
                none
              </button>
            ) : null}
          </>
        )}
      </div>
    </FieldRow>
  );
}

export function ToggleField({ label, checked, onCommit }: { label: string; checked: boolean; onCommit: (v: boolean) => void }) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <input id={id} type="checkbox" className="size-4 justify-self-start" checked={checked} onChange={(e) => onCommit(e.target.checked)} />
    </FieldRow>
  );
}
