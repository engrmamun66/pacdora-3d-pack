"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FoldHingeSpec } from "@packaging/dieline-engine";

const field = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
/** Angles the buttons under the angle field set at once. */
const QUICK_ANGLES = [45, 90, 135, 180] as const;
const MAX_STEP = 100;

export interface FoldRowPatch {
  order?: number;
  angleDeg?: number;
  /** The kind (role) of the panel that swings. */
  kind?: string;
}

/**
 * A number field that applies each valid number as it is typed. While the box is empty (or being retyped) the
 * typed text stays on screen; leaving the field shows the real value again.
 */
function LiveNumber({ value, min, max, label, hint, onValue }: { value: number; min: number; max: number; label: string; hint?: string; onValue: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-0.5 text-xs font-medium">
      {label}
      <input
        className={field}
        type="number"
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Math.round(Number(e.target.value));
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(Math.min(max, Math.max(min, n)));
        }}
        onBlur={() => setDraft(null)}
      />
      {hint ? <span className="text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * One row of the Steps table in a panel that slides in from the left of the window: every column of a fold line
 * (step, angle, kind, direction). There is no Save: each change is applied to that row at once. The page behind stays usable.
 */
export function FoldRowPanel({
  hinge,
  name,
  parentName,
  kinds,
  kind,
  onChange,
  onClose,
}: {
  hinge: FoldHingeSpec;
  /** The panel that swings, and the panel it hangs from. */
  name: string;
  parentName: string;
  kinds: readonly { value: string; label: string; hint?: string }[];
  kind: string;
  onChange: (patch: FoldRowPatch) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const sign = hinge.angleDeg < 0 ? -1 : 1;
  return createPortal(
    <aside aria-label={`Fold settings of ${name}`} className="row-panel-in fixed inset-y-0 left-0 z-50 flex w-[min(15rem,100vw)] flex-col border-r bg-background text-foreground shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">Fold: {name}</h2>
        <button type="button" aria-label="Close" title="Close (Esc)" className="rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={onClose}><X className="size-4" /></button>
      </div>
      <div key={hinge.id} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 text-xs">
        <p className="text-[11px] leading-snug text-muted-foreground">{name} folds along its edge with {parentName}.</p>
        <div className="flex flex-col gap-0.5 text-xs font-medium">
          <span id="fold-direction-label">Direction</span>
          <div role="group" aria-labelledby="fold-direction-label" className="flex gap-1">
            {([[1, "Inward", "Inward: the print stays outside"], [-1, "Outward", "Outward: reverse"]] as const).map(([v, text, tip]) => (
              <button key={v} type="button" aria-pressed={sign === v} title={tip} onClick={() => onChange({ angleDeg: v * Math.abs(hinge.angleDeg) })} className={`h-7 flex-1 rounded-md border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${sign === v ? "border-black bg-black text-white" : "bg-background hover:bg-muted"}`}>{text}</button>
            ))}
          </div>
        </div>
        <LiveNumber label="Step" min={1} max={MAX_STEP} value={hinge.order} hint="Lines with the same step fold together." onValue={(n) => onChange({ order: n })} />
        <div className="flex flex-col gap-1">
          <LiveNumber label="Angle (°)" min={1} max={180} value={Math.abs(hinge.angleDeg)} onValue={(n) => onChange({ angleDeg: sign * n })} />
          <div role="group" aria-label="Set the angle" className="flex gap-1">
            {QUICK_ANGLES.map((a) => (
              <button key={a} type="button" aria-pressed={Math.abs(hinge.angleDeg) === a} title={`Set the angle to ${a}°`} onClick={() => onChange({ angleDeg: sign * a })} className={`h-7 flex-1 rounded-md border text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${Math.abs(hinge.angleDeg) === a ? "border-black bg-black text-white" : "bg-background hover:bg-muted"}`}>{a}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 text-xs font-medium">
          <span id="fold-kind-label">Kind</span>
          <div role="group" aria-labelledby="fold-kind-label" className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <button key={k.value} type="button" aria-pressed={kind === k.value} title={k.hint ?? k.label} onClick={() => onChange({ kind: k.value })} className={`h-7 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${kind === k.value ? "border-black bg-black text-white" : "bg-background hover:bg-muted"}`}>{k.label}</button>
            ))}
          </div>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
