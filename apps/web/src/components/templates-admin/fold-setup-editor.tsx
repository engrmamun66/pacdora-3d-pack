"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Play, RotateCcw, Wand2 } from "lucide-react";
import { createImportedGenerator, detectFoldSetup, importedDefaults, validateFoldSetup, type DielineGeometry, type FlatDieline, type FoldHingeSpec, type FoldSetup, type PanelRole } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { compactOrders, depthOf, rootAt, stepsOf, updateHinge, updatePanel } from "@/lib/fold-edit";
import { pathData } from "@/lib/template-import";

const ROLE_OPTIONS: { value: PanelRole; label: string; hint: string }[] = [
  { value: "body", label: "Wall / main panel", hint: "A side of the box or the front of a card." },
  { value: "closure", label: "Lid or bottom", hint: "A big panel that closes the top or bottom." },
  { value: "tuck", label: "Tuck flap", hint: "A flap that tucks inside." },
  { value: "dust-flap", label: "Dust flap", hint: "A small side flap inside the box." },
  { value: "glue-flap", label: "Glue flap", hint: "The strip that is glued to another panel." },
  { value: "bottom-flap", label: "Bottom flap", hint: "Outer flap of a glued bottom." },
  { value: "lock-flap", label: "Lock flap", hint: "Inner flap of a glued bottom." },
];

const DEPTH_COLORS = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8", "#ddd6fe", "#fed7aa", "#a5f3fc"];
const field = "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

type Sel = { kind: "panel"; id: string } | { kind: "hinge"; id: string } | null;

/** Width and height (mm) of a panel's bounding box. */
const panelSize = (poly: readonly number[]) => {
  const xs = poly.filter((_, i) => i % 2 === 0);
  const ys = poly.filter((_, i) => i % 2 === 1);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const centroid = (poly: readonly number[]): [number, number] => {
  let x = 0;
  let y = 0;
  const n = poly.length / 2;
  for (let i = 0; i < poly.length; i += 2) {
    x += poly[i]!;
    y += poly[i + 1]!;
  }
  return [x / n, y / n];
};

/**
 * The admin's 3D fold screen for an imported dieline: pick the panels, say which one stays
 * flat, and for every fold line its order, direction and angle, with a live 3D preview.
 */
export function FoldSetupEditor({
  flat,
  fold,
  onChange,
  stale,
}: {
  flat: FlatDielineData;
  fold: FoldSetup | null;
  onChange: (f: FoldSetup | null) => void;
  /** True when the lines changed after the fold was set up: it must be detected again or removed. */
  stale: boolean;
}) {
  const [sel, setSel] = useState<Sel>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [progress, setProgress] = useState(1);
  const view = useRef<CartonViewHandle>(null);
  const anim = useRef<number | null>(null);

  const detect = () => {
    const r = detectFoldSetup(flat as FlatDieline);
    setWarnings(r.warnings);
    setSel(null);
    onChange(r.setup);
  };

  const problems = useMemo(() => (fold ? validateFoldSetup(fold) : []), [fold]);
  const geo = useMemo<{ geo: DielineGeometry | null; error: string | null }>(() => {
    if (!fold || problems.length || stale) return { geo: null, error: null };
    try {
      const f = flat as FlatDieline;
      return { geo: createImportedGenerator("preview", f, fold).generate(importedDefaults(f)), error: null };
    } catch (e) {
      return { geo: null, error: e instanceof Error ? e.message : "The 3D preview could not be built." };
    }
  }, [fold, problems, stale, flat]);

  const bounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of flat.cut) {
      for (let i = 0; i + 1 < p.pts.length; i += 2) {
        xs.push(p.pts[i]!);
        ys.push(p.pts[i + 1]!);
      }
    }
    if (!xs.length) return { x: 0, y: 0, w: 100, h: 100 };
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }, [flat]);
  const size = Math.max(bounds.w, bounds.h);
  const pad = size * 0.04;
  const depth = useMemo(() => (fold ? depthOf(fold) : new Map<string, number>()), [fold]);
  const label = (id: string) => fold?.panels.find((p) => p.id === id)?.label ?? id;

  const play = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1500, 1200 * (fold ? stepsOf(fold).length : 1)));
      setProgress(t);
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };

  if (!fold) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <p className="text-sm">This template is <strong>flat only</strong>: customers can resize it, add artwork and export it, but there is no 3D view.</p>
        <p className="text-sm text-muted-foreground">To give it a 3D view, we find the panels between your cut and fold lines, then you check how each fold goes.</p>
        <Button type="button" onClick={detect}><Wand2 className="size-4" aria-hidden /> Detect panels and folds</Button>
      </div>
    );
  }

  const hinges = [...fold.hinges].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const selPanel = sel?.kind === "panel" ? fold.panels.find((p) => p.id === sel.id) : undefined;
  const selHinge = sel?.kind === "hinge" ? fold.hinges.find((h) => h.id === sel.id) : undefined;
  const setHinge = (id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>) => onChange(updateHinge(fold, id, patch));
  const sign = (h: FoldHingeSpec) => (h.angleDeg < 0 ? -1 : 1);
  const steps = stepsOf(fold);

  const hingeRow = (h: FoldHingeSpec) => (
    <tr key={h.id} className={`border-b last:border-0 ${sel?.kind === "hinge" && sel.id === h.id ? "bg-primary/5" : ""}`}>
      <td className="px-2 py-1.5">
        <button type="button" className="text-left text-sm hover:underline" onClick={() => setSel({ kind: "hinge", id: h.id })}>
          {label(h.parentId)} <span className="text-muted-foreground">→</span> {label(h.childId)}
        </button>
      </td>
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-1">
          <button type="button" aria-label={`Fold ${label(h.childId)} earlier`} className="grid size-6 place-items-center rounded border hover:bg-muted disabled:opacity-40" disabled={h.order <= 1} onClick={() => setHinge(h.id, { order: h.order - 1 })}><ChevronUp className="size-3.5" /></button>
          <span className="w-5 text-center tabular-nums">{h.order}</span>
          <button type="button" aria-label={`Fold ${label(h.childId)} later`} className="grid size-6 place-items-center rounded border hover:bg-muted" onClick={() => setHinge(h.id, { order: h.order + 1 })}><ChevronDown className="size-3.5" /></button>
        </span>
      </td>
      <td className="px-2 py-1.5">
        <input
          aria-label={`Angle of ${label(h.parentId)} to ${label(h.childId)}`}
          className={`${field} w-20`}
          type="number"
          min={1}
          max={180}
          step={1}
          value={Math.abs(h.angleDeg)}
          onChange={(e) => {
            const v = Math.min(180, Math.max(1, Math.round(Number(e.target.value) || 90)));
            setHinge(h.id, { angleDeg: sign(h) * v });
          }}
        />
        <span className="ml-1 text-xs text-muted-foreground">°</span>
      </td>
      <td className="px-2 py-1.5">
        <select aria-label={`Direction of ${label(h.parentId)} to ${label(h.childId)}`} className={field} value={sign(h)} onChange={(e) => setHinge(h.id, { angleDeg: Number(e.target.value) * Math.abs(h.angleDeg) })}>
          <option value={1}>Inward (print stays outside)</option>
          <option value={-1}>Outward (reverse)</option>
        </select>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          {fold.panels.length} panels, {fold.hinges.length} fold lines, {steps.length} {steps.length === 1 ? "step" : "steps"}. Click a panel or a fold line to edit it.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={detect}><Wand2 className="size-4" aria-hidden /> Detect again</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { if (window.confirm("Remove the 3D fold? The template becomes flat only.")) { onChange(null); setSel(null); setWarnings([]); } }}>Make flat only</Button>
      </div>

      {stale ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">The lines changed after the fold was set up. Detect the panels again (or make the template flat only) before saving.</p> : null}
      {problems.length ? <ul role="alert" className="list-disc rounded-lg border border-destructive/30 bg-destructive/10 py-2 pl-7 pr-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {warnings.length ? (
        <details className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{warnings.length} note{warnings.length === 1 ? "" : "s"} from the detection</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* flat sheet with panels and fold lines */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="rounded-xl border bg-white p-2">
            <svg viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`} className="max-h-[60vh] w-full" role="img" aria-label="Flat sheet: panels in colour, fold lines numbered by fold step" onClick={() => setSel(null)}>
              {fold.panels.map((p) => {
                const d = depth.get(p.id) ?? 0;
                const on = sel?.kind === "panel" && sel.id === p.id;
                const [cx, cy] = centroid(p.polygon);
                return (
                  <g key={p.id}>
                    <path
                      d={pathData(p.polygon, true)}
                      fill={DEPTH_COLORS[d % DEPTH_COLORS.length]}
                      fillOpacity={on ? 0.95 : 0.6}
                      stroke={on ? "#2563eb" : "#ffffff"}
                      strokeWidth={size / (on ? 120 : 400)}
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSel({ kind: "panel", id: p.id }); }}
                    />
                    <text x={cx} y={cy} textAnchor="middle" fontSize={size / 40} fill="#18181b" pointerEvents="none">{p.label}</text>
                    {p.id === fold.rootId ? <text x={cx} y={cy + size / 32} textAnchor="middle" fontSize={size / 55} fill="#2563eb" fontWeight="600" pointerEvents="none">BASE (stays flat)</text> : null}
                  </g>
                );
              })}
              <g fill="none" pointerEvents="none">
                <path d={flat.cut.map((p) => pathData(p.pts, p.closed)).join("")} stroke="#e6007e" strokeWidth={size / 450} />
                <path d={flat.crease.map((p) => pathData(p.pts, p.closed)).join("")} stroke="#00a0e9" strokeWidth={size / 450} strokeDasharray={`${size / 120} ${size / 240}`} />
              </g>
              {fold.hinges.map((h) => {
                const on = sel?.kind === "hinge" && sel.id === h.id;
                const [x1, y1, x2, y2] = h.line;
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <g key={h.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSel({ kind: "hinge", id: h.id }); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={size / 40} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={h.angleDeg < 0 ? "#ea580c" : "#0f766e"} strokeWidth={size / (on ? 90 : 170)} strokeLinecap="round" />
                    <circle cx={mx} cy={my} r={size / 70} fill={on ? "#2563eb" : "#18181b"} />
                    <text x={mx} y={my + size / 190} textAnchor="middle" fontSize={size / 80} fill="#ffffff" pointerEvents="none">{h.order}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-xs text-muted-foreground">Colours show how deep a panel is from the base. Numbers on the fold lines are the fold steps. <span className="text-teal-700">Green</span> folds inward, <span className="text-orange-600">orange</span> outward.</p>
        </div>

        {/* 3D preview */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="overflow-hidden rounded-xl border bg-muted/40">
            {geo.geo ? (
              <CartonView ref={view} className="h-[min(420px,50vh)] w-full" geo={geo.geo} texture={null} textureRect={null} progress={progress} outsideColor="#ffffff" insideColor="#c8a97e" />
            ) : (
              <p className="grid h-48 place-items-center px-4 text-center text-sm text-muted-foreground">{geo.error ?? "Fix the problems above to see the 3D preview."}</p>
            )}
            <div className="flex items-center gap-2 border-t bg-background px-3 py-2 text-xs">
              <label className="flex flex-1 items-center gap-2">
                Open
                <input type="range" min={0} max={100} value={Math.round(progress * 100)} className="flex-1" aria-label="Fold amount: open to closed" onChange={(e) => setProgress(Number(e.target.value) / 100)} />
                Closed
              </label>
              <button type="button" aria-label="Play the fold step by step" className="grid size-7 place-items-center rounded-md border hover:bg-muted" onClick={play}><Play className="size-3.5" /></button>
              <button type="button" aria-label="Reset camera" className="grid size-7 place-items-center rounded-md border hover:bg-muted" onClick={() => view.current?.resetView()}><RotateCcw className="size-3.5" /></button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Steps fold one after another. If the box looks wrong, check the angles, directions and steps on the left.</p>
        </div>
      </div>

      {/* inspector */}
      {selPanel ? (
        <section aria-label="Panel settings" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Name
            <input className={field} value={selPanel.label} maxLength={40} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { label: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Kind
            <select className={field} value={selPanel.role} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { role: e.target.value as PanelRole }))}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="text-xs font-normal text-muted-foreground">{ROLE_OPTIONS.find((r) => r.value === selPanel.role)?.hint}</span>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={selPanel.printable} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { printable: e.target.checked }))} />
            Artwork can be printed here
          </label>
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
            Size: <strong className="text-foreground tabular-nums">{panelSize(selPanel.polygon).w.toFixed(1)} × {panelSize(selPanel.polygon).h.toFixed(1)} mm</strong> at the imported size, {selPanel.polygon.length / 2} corners.
          </p>
          <div className="self-end pb-1">
            {selPanel.id === fold.rootId ? <p className="text-sm text-muted-foreground">This is the base panel.</p> : <Button type="button" variant="outline" size="sm" onClick={() => onChange(rootAt(fold, selPanel.id))}>Make this the base (stays flat)</Button>}
          </div>
        </section>
      ) : null}
      {selHinge ? (
        <section aria-label="Fold settings" className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{label(selHinge.parentId)} → {label(selHinge.childId)}</p>
          <p className="text-muted-foreground">
            {label(selHinge.childId)} swings about this fold line while {label(selHinge.parentId)} stays. Line length{" "}
            <strong className="tabular-nums text-foreground">{Math.hypot(selHinge.line[2] - selHinge.line[0], selHinge.line[3] - selHinge.line[1]).toFixed(1)} mm</strong>. Change step, angle and direction in the table below.
          </p>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Fold lines</caption>
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr><th className="px-2 py-2 font-medium">Fold (stays → swings)</th><th className="px-2 py-2 font-medium">Step</th><th className="px-2 py-2 font-medium">Angle</th><th className="px-2 py-2 font-medium">Direction</th></tr>
          </thead>
          <tbody>{hinges.map(hingeRow)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(compactOrders(fold))}>Tidy step numbers</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...fold, hinges: fold.hinges.map((h) => ({ ...h, angleDeg: Math.sign(h.angleDeg || 1) * 90 })) })}>Set every angle to 90°</Button>
      </div>
    </div>
  );
}
