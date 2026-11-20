"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FoldHingeSpec } from "@packaging/dieline-engine";

const field = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
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
    <label className="flex flex-col gap-1 font-medium">
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
      {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
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
  kinds: readonly { value: string; label: string }[];
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
    <aside aria-label={`Fold settings of ${name}`} className="row-panel-in fixed inset-y-0 left-0 z-50 flex w-[min(20rem,100vw)] flex-col border-r bg-background text-foreground shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="min-w-0 truncate font-semibold">Fold: {name}</h2>
        <button type="button" aria-label="Close" title="Close (Esc)" className="rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={onClose}><X className="size-4" /></button>
      </div>
      <div key={hinge.id} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        <p className="text-muted-foreground">{name} folds along its edge with {parentName}. Changes apply at once.</p>
        <LiveNumber label="Step" min={1} max={MAX_STEP} value={hinge.order} hint="Lines with the same step fold together." onValue={(n) => onChange({ order: n })} />
        <LiveNumber label="Angle (°)" min={1} max={180} value={Math.abs(hinge.angleDeg)} onValue={(n) => onChange({ angleDeg: sign * n })} />
        <label className="flex flex-col gap-1 font-medium">Kind
          <select className={field} value={kind} onChange={(e) => onChange({ kind: e.target.value })}>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">Direction
          <select className={field} value={sign} onChange={(e) => onChange({ angleDeg: Number(e.target.value) * Math.abs(hinge.angleDeg) })}>
            <option value={1}>Inward (print stays outside)</option>
            <option value={-1}>Outward (reverse)</option>
          </select>
        </label>
      </div>
    </aside>,
    document.body,
  );
}
