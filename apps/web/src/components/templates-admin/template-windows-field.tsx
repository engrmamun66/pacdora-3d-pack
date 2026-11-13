"use client";

import { useMemo, useState } from "react";
import { AppWindow, Pencil, Trash2 } from "lucide-react";
import { WINDOW_SHAPE_LABELS, applyWindows, type DielineGeometry, type WindowShape, type WindowSpec } from "@packaging/dieline-engine";
import { renderDielineSvg } from "@packaging/render-svg";
import { toDisplay, type Unit } from "@/components/dielines/units";
import { Button } from "@/components/ui/button";
import { InfoTip } from "./help-tip";
import { WindowEditorModal } from "./window-editor-modal";

const label = (w: WindowSpec) => WINDOW_SHAPE_LABELS[w.shape as WindowShape] ?? w.shape;

/**
 * Window holes every new project from this template starts with. Customers see them on their dieline and can
 * move, resize or delete them (or add their own): this is only the starting point.
 * `geo` is the dieline at its starting size; null when the template cannot take windows yet (the reason is shown).
 */
export function TemplateWindowsField({
  geo,
  unavailable,
  value,
  onChange,
  thickness,
  boardColor = "#c9a574",
}: {
  geo: DielineGeometry | null;
  unavailable: string;
  value: readonly WindowSpec[];
  onChange: (w: WindowSpec[]) => void;
  thickness: number;
  boardColor?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<Unit>("mm");
  const result = useMemo(() => (geo ? applyWindows(geo, value) : null), [geo, value]);
  const picture = useMemo(() => {
    if (!result) return null;
    try {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderDielineSvg(result.geo, {}))}`;
    } catch {
      return null;
    }
  }, [result]);

  if (!geo || !result) return <p className="text-sm text-muted-foreground">{unavailable}</p>;
  const bad = new Map(result.problems.filter((p) => p.id).map((p) => [p.id, p.message]));
  const fmt = (mm: number) => toDisplay(String(mm), unit);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex min-w-0 flex-col gap-3">
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No window holes. Customers start with a solid box and can add their own.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border text-sm" aria-label="Window holes">
            {value.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{i + 1}. {label(w)}</span>
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">{fmt(w.width)} × {fmt(w.height)} {unit}</span>
                  {bad.has(w.id) ? <span role="alert" className="mt-0.5 block text-xs text-destructive">{bad.get(w.id)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {result.problems.length > 0 ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {result.problems.length === 1 ? "One window does not fit" : `${result.problems.length} windows do not fit`} the dieline any more. Open the editor and move or delete {result.problems.length === 1 ? "it" : "them"}; saving is blocked until then.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setEditing(true)}>
            {value.length === 0 ? <><AppWindow className="size-4" aria-hidden /> Add window holes</> : <><Pencil className="size-4" aria-hidden /> Edit window holes</>}
          </Button>
          {value.length > 0 ? <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onChange([])}><Trash2 className="size-4" aria-hidden /> Remove all</Button> : null}
          <InfoTip label="Window holes">New projects start with these holes at the box&apos;s starting size. Customers can still move, resize or delete them on their dieline page. Each hole must stay inside one panel, away from folds and edges.</InfoTip>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-2">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
          <img src={picture} alt="Dieline with its window holes" className="mx-auto max-h-56 w-full object-contain" />
        ) : <p className="p-6 text-center text-xs text-muted-foreground">No preview.</p>}
      </div>

      <WindowEditorModal open={editing} geo={geo} value={value} unit={unit} onUnit={setUnit} onCancel={() => setEditing(false)} onDone={(next) => { onChange(next); setEditing(false); }} thickness={thickness} boardColor={boardColor} />
    </div>
  );
}

