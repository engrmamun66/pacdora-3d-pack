"use client";

import { useMemo, useState } from "react";
import type { ParamDescriptor } from "@packaging/dieline-engine";
import { MaterialPicker, ThicknessField } from "@/components/dielines/settings-fields";
import { materialFor, materialsFor, type Unit } from "@/components/dielines/units";

/**
 * Admin field: the board (material + thickness) new projects start with on a built-in template.
 * Same menu and list as the customer's "Choose material" (docs/thickness.md). Empty = the
 * template's own default.
 */
export function DefaultMaterialField({
  min,
  max,
  value,
  onChange,
  alwaysShown = false,
  legend = "Default material",
  hint = "New projects start with this board. Customers can change it.",
  resetLabel = "Use the template's standard board",
  canReset = true,
}: {
  /** Limits of the generator's thickness (mm). */
  min: number;
  max: number;
  /** mm, or null for the template's own default. */
  value: number | null;
  onChange: (mm: number | null) => void;
  /** Show the menu and thickness straight away (`value` is then the board in use), like the customer's page; no "Set a default material" step. */
  alwaysShown?: boolean;
  legend?: string;
  hint?: string;
  /** Text of the link that clears the choice (calls onChange(null)); shown only when `value` is a real choice. */
  resetLabel?: string;
  /** Show the reset link. */
  canReset?: boolean;
}) {
  const types = useMemo(() => materialsFor(min, max), [min, max]);
  const [unit, setUnit] = useState<Unit>("mm");
  const [material, setMaterial] = useState(() => materialFor(value ?? 0.5, types.length ? types : undefined));
  const param: ParamDescriptor & { kind: "number" } = {
    key: "thickness",
    kind: "number",
    label: "Board thickness",
    unit: "mm",
    group: "Material",
    min,
    max,
    step: 0.05,
    optional: false,
  };
  if (types.length === 0) return null;
  const grade = types.find((t) => t.id === material.typeId)?.grades.find((g) => g.id === material.gradeId);

  const pick = (typeId: string, gradeId: string) => {
    const g = types.find((t) => t.id === typeId)?.grades.find((x) => x.id === gradeId);
    if (!g) return;
    setMaterial({ typeId, gradeId });
    onChange(g.thickness);
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      {value === null && !alwaysShown ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">New projects start with the template&apos;s standard board.</p>
          <button
            type="button"
            className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
            onClick={() => {
              const m = materialFor(0.5, types);
              const g = types.find((t) => t.id === m.typeId)?.grades.find((x) => x.id === m.gradeId);
              setMaterial(m);
              onChange(g?.thickness ?? Math.min(max, Math.max(min, 0.5)));
            }}
          >
            Set a default material
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{hint}</p>
            <div role="radiogroup" aria-label="Unit" className="flex shrink-0 gap-1 rounded-lg border p-0.5 text-xs">
              {(["mm", "in"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => setUnit(u)}
                  className={`rounded-md px-2.5 py-1 ${unit === u ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MaterialPicker types={types} typeId={material.typeId} gradeId={material.gradeId} unit={unit} onPick={pick} />
            <ThicknessField
              p={param}
              value={String(value ?? 0.5)}
              unit={unit}
              grade={grade}
              onChange={(t) => {
                const n = Number(t);
                if (Number.isFinite(n) && n > 0) onChange(n);
              }}
            />
          </div>
          {canReset ? (
            <button type="button" className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => onChange(null)}>
              {resetLabel}
            </button>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
