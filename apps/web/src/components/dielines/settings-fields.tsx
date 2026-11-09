"use client";

import { useState } from "react";
import type { ParamDescriptor } from "@packaging/dieline-engine";
import { CUSTOM_GRADE, MATERIAL_TYPES, MM_PER_INCH, fromDisplay, toDisplay, type Unit } from "./units";

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

/** Board family and grade. Picking a grade sets the caliper; "Custom" leaves it to the thickness field. */
export function MaterialPicker({
  typeId,
  gradeId,
  onType,
  onGrade,
}: {
  typeId: string;
  gradeId: string;
  onType: (id: string) => void;
  onGrade: (id: string) => void;
}) {
  const type = MATERIAL_TYPES.find((t) => t.id === typeId) ?? MATERIAL_TYPES[0]!;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="material-type" className="text-xs font-medium">Material</label>
        <div className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded-full border" style={{ background: type.color }} aria-hidden />
          <select id="material-type" value={type.id} onChange={(e) => onType(e.target.value)} className={inputCls}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="material-grade" className="text-xs font-medium">Grade</label>
        <select id="material-grade" aria-describedby="material-hint" value={gradeId} onChange={(e) => onGrade(e.target.value)} className={inputCls}>
          {type.grades.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
          <option value={CUSTOM_GRADE}>Custom {type.label.toLowerCase()}</option>
        </select>
        <p id="material-hint" className="text-xs text-muted-foreground">
          Typical calipers, not supplier data. Choose Custom to type the exact thickness your supplier gives you.
        </p>
      </div>
    </div>
  );
}
