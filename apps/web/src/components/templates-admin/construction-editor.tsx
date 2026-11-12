"use client";

import { useMemo, useState } from "react";
import {
  CONSTRUCTION_DEFAULTS,
  DIM_KEYS,
  DIM_NAMES,
  FACTOR_RANGE,
  FLAP_SIZE_KEYS,
  THICKNESS_RANGE,
  type Construction,
  type DimKey,
  type DimName,
  type FlapKey,
  type FoldSetup,
  fullPlan,
  resolveConstruction,
  sizeOffset,
  validateConstruction,
} from "@packaging/dieline-engine";
import { setConstruction } from "@/lib/fold-edit";
import { DefaultMaterialField } from "./default-material-field";

const field = "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";
const round1 = (v: number) => Math.round(v * 10) / 10;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FLAP_LABELS: Record<FlapKey, string> = { tuckDepth: "Tuck flap depth", glueFlapWidth: "Glue flap width", dustFlapDepth: "Dust flap depth" };
const FLAP_ROLE: Record<FlapKey, string> = { tuckDepth: "Tuck flap", glueFlapWidth: "Glue flap", dustFlapDepth: "Dust flap" };

/** A number box that lets the admin type "0." on the way to "0.5"; empty = no value. */
function NumberBox({ value, placeholder, onChange, label, min, max, step }: { value: number | undefined; placeholder?: string; onChange: (v: number | undefined) => void; label: string; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  // Follow changes made from outside (a reset), but not the ones this box made itself.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    const typed = text.trim() === "" || !Number.isFinite(Number(text)) ? undefined : Number(text);
    if (typed !== value) setText(value === undefined ? "" : String(value));
  }
  return (
    <input
      className={`${field} w-28`}
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      {...(step !== undefined ? { step } : {})}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? undefined : n);
      }}
    />
  );
}

/**
 * Admin: the box settings of an imported dieline. Everything is guessed from the file first
 * (shown as the placeholder or the selected value); change whatever is not right.
 */
export function ConstructionEditor({ fold, onChange }: { fold: FoldSetup; onChange: (f: FoldSetup) => void }) {
  const plan = useMemo(() => fullPlan(fold), [fold]);
  const c = fold.construction;
  // The material menu keeps its own pick (several boards can share a thickness); a reset starts it over.
  const [materialKey, setMaterialKey] = useState(0);
  if (!plan) {
    // No box settings for this fold (two pieces, odd shape...): the board can still be chosen, it only names the material.
    return (
      <section aria-label="Material and paper" className="flex flex-col gap-4">
        <div>
          <h3 className="text-base font-semibold">Material & Paper</h3>
          <p className="text-sm text-muted-foreground">Box sizes and flaps are not available for this fold (they need one body piece whose base panel has walls around it). The board can still be chosen: customers see it as the material of the template.</p>
        </div>
        <DefaultMaterialField
          key={materialKey}
          alwaysShown
          legend="Material"
          hint="The board customers start with on the dieline page. They can change it there."
          resetLabel="Use the suggested board"
          canReset={c?.thickness !== undefined}
          min={THICKNESS_RANGE.min}
          max={THICKNESS_RANGE.max}
          value={c?.thickness ?? CONSTRUCTION_DEFAULTS.thickness}
          onChange={(mm) => {
            if (mm === null) setMaterialKey((n) => n + 1);
            onChange(setConstruction(fold, mm === null ? null : { ...(c ?? {}), thickness: mm }));
          }}
        />
      </section>
    );
  }
  const res = resolveConstruction(c, plan);
  const problems = validateConstruction(c);
  const set = (patch: Partial<Construction>) => onChange(setConstruction(fold, { ...(c ?? {}), ...patch }));
  const setStart = (key: keyof NonNullable<Construction["start"]>, v: number | undefined) => set({ start: { ...(c?.start ?? {}), [key]: v } });
  const off = sizeOffset(res.sizeMode, res.allowanceFactor, res.thickness);
  const dims = [...DIM_KEYS].sort((a, b) => DIM_NAMES.indexOf(res.names[a]) - DIM_NAMES.indexOf(res.names[b]));
  const rename = (key: DimKey, to: DimName) => {
    const other = DIM_KEYS.find((k) => k !== key && res.names[k] === to);
    set({ names: { ...res.names, [key]: to, ...(other ? { [other]: res.names[key] } : {}) } });
  };
  const flaps = FLAP_SIZE_KEYS.filter((k) => plan.natural[k] !== undefined);
  const th = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground";

  return (
    <section aria-label="Material and paper" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Material & Paper</h3>
          <p className="text-sm text-muted-foreground">Guessed from the file. Change what is not right: customers get these as options on the dieline page, like a built-in box.</p>
        </div>
        {c ? (
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => { setMaterialKey((n) => n + 1); onChange(setConstruction(fold, null)); }}>
            Use the guessed values
          </button>
        ) : null}
      </div>
      {problems.length ? <ul role="alert" className="list-disc rounded-lg border border-destructive/30 bg-destructive/10 py-2 pl-7 pr-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}

      {/* The same material menu and thickness the customer sees on the dieline page: Type and grade, then the board thickness. */}
      <DefaultMaterialField
        key={materialKey}
        alwaysShown
        legend="Material"
        hint="The board customers start with on the dieline page. They can change it there."
        resetLabel="Use the guessed board"
        canReset={c?.thickness !== undefined}
        min={THICKNESS_RANGE.min}
        max={THICKNESS_RANGE.max}
        value={res.thickness}
        onChange={(mm) => {
          if (mm === null) setMaterialKey((n) => n + 1);
          set({ thickness: mm ?? undefined });
        }}
      />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th} scope="col">Size</th>
              <th className={th} scope="col">As drawn (crease to crease)</th>
              <th className={th} scope="col">Called</th>
              <th className={th} scope="col">Starts at (mm)</th>
            </tr>
          </thead>
          <tbody>
            {dims.map((key) => (
              <tr key={key} className="border-b last:border-0">
                <td className="px-2 py-1.5">{key === "baseWidth" ? "Base panel width" : key === "baseHeight" ? "Base panel height" : "Wall height"}</td>
                <td className="px-2 py-1.5 tabular-nums">{round1(plan.natural[key])} mm</td>
                <td className="px-2 py-1.5">
                  <select className={field} aria-label={`What the ${key} size is called`} value={res.names[key]} onChange={(e) => rename(key, e.target.value as DimName)}>
                    {DIM_NAMES.map((n) => <option key={n} value={n}>{cap(n)}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <NumberBox label={`Starting ${res.names[key]}`} value={c?.start?.[key]} placeholder={String(round1(plan.natural[key] - off))} min={0.1} max={10000} step={0.5} onChange={(v) => setStart(key, v)} />
                </td>
              </tr>
            ))}
            {flaps.map((key) => (
              <tr key={key} className="border-b last:border-0">
                <td className="px-2 py-1.5">{FLAP_LABELS[key]}</td>
                <td className="px-2 py-1.5 tabular-nums">{round1(plan.natural[key]!)} mm</td>
                <td className="px-2 py-1.5">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={res.flaps.includes(key)} onChange={(e) => set({ flaps: e.target.checked ? [...res.flaps, key] : res.flaps.filter((k) => k !== key) })} />
                    Let customers change it
                  </label>
                </td>
                <td className="px-2 py-1.5">
                  <NumberBox label={`Starting ${FLAP_LABELS[key].toLowerCase()}`} value={c?.start?.[key]} placeholder={String(round1(plan.natural[key]!))} min={0.1} max={10000} step={0.5} onChange={(v) => setStart(key, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        The sizes are measured from the lines. Start sizes are in the size mode below; leave one empty to start as drawn.
        {flaps.length === 0 ? ` No flap sizes: set a panel's kind to ${Object.values(FLAP_ROLE).join(", ")} in the panel settings above. Only a stretch of the sheet that nothing but those flaps covers can be resized.` : " A flap can be resized only where nothing but flaps of that kind cover the sheet."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Size mode
          <select className={`${field} h-10`} value={res.sizeMode} onChange={(e) => set({ sizeMode: e.target.value as Construction["sizeMode"] })}>
            <option value="manufacture">Manufacture (crease-to-crease)</option>
            <option value="inner">Inner (inside of the box)</option>
          </select>
          <span className="text-xs font-normal text-muted-foreground">What Width, Depth and Height mean on the page to start with. The drawing is crease-to-crease.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Allowance (x thickness)
          <NumberBox label="Allowance" value={c?.allowanceFactor} placeholder={String(CONSTRUCTION_DEFAULTS.allowanceFactor)} min={FACTOR_RANGE.min} max={FACTOR_RANGE.max} step={0.1} onChange={(v) => set({ allowanceFactor: v })} />
          <span className="text-xs font-normal text-muted-foreground">Inner mode: crease-to-crease = inner + allowance x thickness.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Cut gap (x thickness)
          <NumberBox label="Cut gap" value={c?.cutGapFactor} placeholder={String(CONSTRUCTION_DEFAULTS.cutGapFactor)} min={FACTOR_RANGE.min} max={FACTOR_RANGE.max} step={0.1} onChange={(v) => set({ cutGapFactor: v })} />
          <span className="text-xs font-normal text-muted-foreground">Slot between a dust flap and the closure beside it ({Math.round(res.cutGapFactor * res.thickness * 100) / 100} mm). Shown in the dieline info; the drawn slots are not changed.</span>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {c?.thickness === undefined ? `Not set: the page starts with ${CONSTRUCTION_DEFAULTS.thickness} mm board. ` : ""}In inner mode the sheet grows with the board thickness; in manufacture mode the thickness only labels the material.
      </p>
    </section>
  );
}
