"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { ParamDescriptor } from "@packaging/dieline-engine";
import { MM_PER_INCH, fmtRange, fromDisplay, gradeLabel, toDisplay, type MaterialGrade, type MaterialType, type Unit } from "./units";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

/** One engine parameter. Numbers are stored in mm; the unit switch only changes what is typed and shown. */
export function ParamField({
  p,
  value,
  unit,
  placeholderMm,
  error,
  disabled,
  onChange,
}: {
  p: ParamDescriptor;
  /** mm text (or the enum value). */
  value: string;
  unit: Unit;
  placeholderMm?: number;
  error?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const id = `param-${p.key}`;
  const [draft, setDraft] = useState<string | null>(null);
  const hintId = `${id}-hint`;
  const hint = error ?? p.help;

  if (p.kind === "enum") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium">{p.label}</label>
        <select id={id} value={value} aria-describedby={hint ? hintId : undefined} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {p.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {hint ? <p id={hintId} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{hint}</p> : null}
      </div>
    );
  }

  const isLength = p.unit === "mm";
  const u: Unit = isLength ? unit : "mm";
  const shown = draft ?? toDisplay(value, u);
  const div = u === "in" ? MM_PER_INCH : 1;
  const ph = placeholderMm === undefined ? (p.optional ? "auto" : undefined) : `${p.optional ? "auto" : "default"} (${toDisplay(String(placeholderMm.toFixed(2)), u)})`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {p.label}
        <span className="font-normal text-muted-foreground"> ({isLength ? unit : "×"})</span>
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={p.min / div}
        max={p.max / div}
        step={u === "in" ? "any" : p.step}
        value={shown}
        disabled={disabled}
        placeholder={ph}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(fromDisplay(e.target.value, u));
        }}
        onBlur={() => setDraft(null)}
        className={inputCls}
      />
      {hint ? <p id={hintId} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{hint}</p> : null}
    </div>
  );
}

/**
 * One field for the material. It opens a menu of board families; pointing at a family (or
 * pressing Right) opens its items in a submenu next to it, and picking an item closes both.
 * A fixed item decides the thickness. The menu is `fixed`-positioned so the scrolling side
 * panel cannot clip it.
 */
export function MaterialPicker({
  types,
  typeId,
  gradeId,
  unit,
  onPick,
}: {
  types: readonly MaterialType[];
  typeId: string;
  gradeId: string;
  unit: Unit;
  onPick: (typeId: string, gradeId: string) => void;
}) {
  const type = types.find((t) => t.id === typeId) ?? types[0]!;
  const grade = type.grades.find((g) => g.id === gradeId) ?? type.grades[0]!;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(type.id);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const uid = useId();

  const show = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setBox({ left: r.left, top: r.bottom + 4, width: r.width });
    setActive(type.id);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const down = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const away = () => setOpen(false);
    document.addEventListener("pointerdown", down);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    // Focus the current family so the arrow keys work straight away.
    menu.current?.querySelector<HTMLElement>(`[data-type="${type.id}"]`)?.focus();
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open, type.id]);

  const items = (level: "type" | "grade") => Array.from(menu.current?.querySelectorAll<HTMLElement>(`[data-level="${level}"]`) ?? []);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = document.activeElement as HTMLElement | null;
    const level = el?.dataset.level as "type" | "grade" | undefined;
    if (!el || !level) return;
    const list = items(level);
    const i = list.indexOf(el);
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown") list[(i + 1) % list.length]?.focus();
    else if (e.key === "ArrowUp") list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === "ArrowRight" && level === "type") items("grade")[0]?.focus();
    else if (e.key === "ArrowLeft" && level === "grade") menu.current?.querySelector<HTMLElement>(`[data-type="${active}"]`)?.focus();
    else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  const activeType = types.find((t) => t.id === active) ?? type;
  const row = "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm outline-none";

  return (
    <div className="flex flex-col gap-1">
      <span id={`${uid}-label`} className="text-xs font-medium">Material</span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-value`}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className={`${inputCls} flex items-center gap-2 text-left ${open ? "border-ring ring-3 ring-ring/50" : ""}`}
      >
        <span className="size-5 shrink-0 rounded-full border" style={{ background: type.color }} aria-hidden />
        <span id={`${uid}-value`} className="min-w-0 flex-1 truncate">{gradeLabel(grade, unit)}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && box ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Material"
          onKeyDown={keys}
          style={{ position: "fixed", left: box.left, top: box.top, width: box.width }}
          className="z-50"
        >
          <div className="overflow-hidden rounded-xl border bg-popover py-1 text-popover-foreground shadow-lg">
            {types.map((t) => {
              const on = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={on}
                  data-level="type"
                  data-type={t.id}
                  tabIndex={-1}
                  onPointerEnter={() => setActive(t.id)}
                  onFocus={() => setActive(t.id)}
                  onClick={() => setActive(t.id)}
                  className={`${row} ${on ? "bg-muted" : ""} ${t.id === type.id ? "font-medium" : ""}`}
                >
                  <span className="flex-1">{t.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </button>
              );
            })}
          </div>
          <div role="menu" aria-label={`${activeType.label} items`} className="absolute top-0 left-full max-h-[70vh] w-max min-w-64 max-w-[22rem] pl-1">
            <div className="overflow-y-auto rounded-xl border bg-popover py-1 text-popover-foreground shadow-lg">
              {activeType.grades.map((g) => {
                const on = g.id === grade.id && activeType.id === type.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    data-level="grade"
                    tabIndex={-1}
                    onClick={() => {
                      onPick(activeType.id, g.id);
                      close(true);
                    }}
                    className={`${row} hover:bg-muted focus-visible:bg-muted ${on ? "font-medium text-primary" : ""}`}
                  >
                    <span className="size-5 shrink-0 rounded-full border" style={{ background: activeType.color }} aria-hidden />
                    <span className="flex-1">{gradeLabel(g, unit)}</span>
                    {on ? <Check className="size-4" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Board thickness with - / + buttons. Fixed by the material for a standard paperboard; typed
 * (with a suggested range) for a flute or a custom item. The fold allowance follows it.
 */
export function ThicknessField({
  p,
  value,
  unit,
  grade,
  error,
  onChange,
}: {
  /** The engine's thickness parameter (limits in mm). */
  p: ParamDescriptor & { kind: "number" };
  /** mm text. */
  value: string;
  unit: Unit;
  grade: MaterialGrade | undefined;
  error?: string;
  onChange: (mmText: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const locked = grade?.fixed ?? false;
  const mm = Number(value);
  const stepMm = unit === "mm" ? 0.1 : MM_PER_INCH * 0.004;
  const bump = (dir: 1 | -1) => {
    const base = Number.isFinite(mm) ? mm : (grade?.thickness ?? p.min);
    const next = Math.min(p.max, Math.max(p.min, Math.round((base + dir * stepMm) * 1000) / 1000));
    setDraft(null);
    onChange(String(next));
  };
  const outside = grade?.suggest && Number.isFinite(mm) && (mm < grade.suggest[0] - 1e-9 || mm > grade.suggest[1] + 1e-9);
  const btn = "grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-lg leading-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="param-thickness" className="text-xs font-medium">
        {locked ? "Thickness" : "Custom thickness"}
        {grade?.suggest ? <span className="font-normal text-muted-foreground"> ({fmtRange(grade.suggest, unit)})</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Thinner" disabled={locked} onClick={() => bump(-1)} className={btn}>−</button>
        <input
          id="param-thickness"
          type="number"
          inputMode="decimal"
          min={unit === "in" ? p.min / MM_PER_INCH : p.min}
          max={unit === "in" ? p.max / MM_PER_INCH : p.max}
          step="any"
          disabled={locked}
          value={draft ?? toDisplay(value, unit)}
          aria-invalid={error ? true : undefined}
          aria-describedby="param-thickness-hint"
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(fromDisplay(e.target.value, unit));
          }}
          onBlur={() => setDraft(null)}
          className={`${inputCls} text-center tabular-nums`}
        />
        <span className="w-6 shrink-0 text-xs text-muted-foreground">{unit}</span>
        <button type="button" aria-label="Thicker" disabled={locked} onClick={() => bump(1)} className={btn}>+</button>
      </div>
      <p id="param-thickness-hint" className={`text-xs ${error ? "text-destructive" : outside ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
        {error ?? (locked ? "Set by the material. With Size mode set to Inner, the fold allowance follows it." : outside ? `Outside the suggested range ${fmtRange(grade!.suggest!, unit)}. Check it with your supplier.` : "With Size mode set to Inner, the fold allowance follows this thickness.")}
      </p>
    </div>
  );
}
