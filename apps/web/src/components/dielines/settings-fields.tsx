"use client";

import { useState } from "react";
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

/** Board family (Material) and then the item inside it. A fixed item decides the thickness. */
export function MaterialPicker({
  types,
  typeId,
  gradeId,
  unit,
  onType,
  onGrade,
}: {
  types: readonly MaterialType[];
  typeId: string;
  gradeId: string;
  unit: Unit;
  onType: (id: string) => void;
  onGrade: (id: string) => void;
}) {
  const type = types.find((t) => t.id === typeId) ?? types[0]!;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="material-type" className="text-xs font-medium">Material</label>
        <div className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded-full border" style={{ background: type.color }} aria-hidden />
          <select id="material-type" value={type.id} onChange={(e) => onType(e.target.value)} className={inputCls}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="material-grade" className="text-xs font-medium">{type.label} item</label>
        <select id="material-grade" aria-describedby="material-hint" value={gradeId} onChange={(e) => onGrade(e.target.value)} className={inputCls}>
          {type.grades.map((g) => (
            <option key={g.id} value={g.id}>{gradeLabel(g, unit)}</option>
          ))}
        </select>
        <p id="material-hint" className="text-xs text-muted-foreground">
          Typical thicknesses, not supplier data. Pick a custom item (or a flute) to type the exact thickness your supplier gives you.
        </p>
      </div>
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
