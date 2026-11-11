"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListOrdered, Play, RotateCcw, Wand2 } from "lucide-react";
import { createImportedGenerator, detectFoldSetup, importedDefaults, validateFoldSetup, type DielineGeometry, type FlatDieline, type FoldHingeSpec, type FoldSetup, type PanelRole, type PartPlacementMode } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { applyFoldSequence, compactOrders, depthOf, makeMain, moveHinge, pieceOf, rootAt, rootsOf, setGround, sortedHinges, stepsOf, updateHinge, updatePanel, updatePart } from "@/lib/fold-edit";
import { HingeList } from "./hinge-list";
import { PanelKindHelp } from "./panel-kind-help";
import { QuickSortBar } from "./quick-sort-bar";
import type { ViewSettings } from "@/lib/view-settings";
import { GridToggle } from "@/components/viewer3d/grid-toggle";
import { RotationControls } from "@/components/viewer3d/rotation-controls";
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

const PLACEMENT_OPTIONS: { value: PartPlacementMode; label: string }[] = [
  { value: "open", label: "Open, tilted above the main body" },
  { value: "closed", label: "Closed, on top of the main body" },
  { value: "beside", label: "Beside the main body" },
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
  barBottom = "0.75rem",
  startView = null,
}: {
  flat: FlatDielineData;
  fold: FoldSetup | null;
  onChange: (f: FoldSetup | null) => void;
  /** True when the lines changed after the fold was set up: it must be detected again or removed. */
  stale: boolean;
  /** Distance of the quick sort bar from the window bottom, so it clears a sticky save bar. */
  barBottom?: string;
  /** The template's saved starting 3D view: the preview opens with it, returns to it on reset, and moves to it when it changes. */
  startView?: ViewSettings | null;
}) {
  const [sel, setSel] = useState<Sel>(null);
  // Quick sort: while on, a click on a fold line (or the panel it swings) adds it to `queue`.
  const [quick, setQuick] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [progress, setProgress] = useState(startView?.progress ?? 1);
  const view = useRef<CartonViewHandle>(null);
  const anim = useRef<number | null>(null);

  // A newly saved (or removed) starting view shows in this preview at once: the fold amount is set while rendering, the camera in an effect.
  const [seenView, setSeenView] = useState(startView);
  if (seenView !== startView) {
    setSeenView(startView);
    if (startView) setProgress(startView.progress);
  }
  const cameraView = useRef(startView);
  useEffect(() => {
    if (cameraView.current === startView) return;
    cameraView.current = startView;
    if (startView) view.current?.setView(startView);
    else view.current?.resetView();
  }, [startView]);

  const detect = () => {
    const r = detectFoldSetup(flat as FlatDieline);
    setWarnings(r.warnings);
    setSel(null);
    setQuick(false);
    setQueue([]);
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

  const hinges = sortedHinges(fold);
  const hingeName = (id: string) => {
    const h = fold.hinges.find((x) => x.id === id);
    return h ? `${label(h.parentId)} → ${label(h.childId)}` : id;
  };
  const liveQueue = queue.filter((id) => fold.hinges.some((h) => h.id === id));
  const toggleQueued = (id: string) => setQueue((q) => (q.includes(id) ? q.filter((x) => x !== id) : [...q, id]));
  const stopQuick = () => { setQuick(false); setQueue([]); };
  const selPanel = sel?.kind === "panel" ? fold.panels.find((p) => p.id === sel.id) : undefined;
  const selHinge = sel?.kind === "hinge" ? fold.hinges.find((h) => h.id === sel.id) : undefined;
  const setHinge = (id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>) => onChange(updateHinge(fold, id, patch));
  const steps = stepsOf(fold);
  const roots = rootsOf(fold);
  const parts = fold.parts ?? [];
  /** "Main body" or "Part 2" for the piece whose base panel is `rootId`. */
  const pieceName = (rootId: string) => (rootId === fold.rootId ? "Main body" : `Part ${roots.indexOf(rootId) + 1}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          {fold.panels.length} panels, {fold.hinges.length} fold lines, {steps.length} {steps.length === 1 ? "step" : "steps"}{parts.length ? `, ${parts.length + 1} pieces` : ""}.
        </p>
        <Button type="button" variant={quick ? "default" : "outline"} size="sm" aria-pressed={quick} onClick={() => (quick ? stopQuick() : (setQuick(true), setSel(null)))}><ListOrdered className="size-4" aria-hidden /> Quick sort</Button>
        <Button type="button" variant="outline" size="sm" onClick={detect}><Wand2 className="size-4" aria-hidden /> Detect again</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { if (window.confirm("Remove the 3D fold? The template becomes flat only.")) { onChange(null); setSel(null); setWarnings([]); } }}>Make flat only</Button>
      </div>

      {stale ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">The lines changed after the fold was set up. Detect the panels again (or make the template flat only) before saving.</p> : null}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (quick) {
                          const h = fold.hinges.find((x) => x.childId === p.id);
                          if (h) toggleQueued(h.id);
                        } else setSel({ kind: "panel", id: p.id });
                      }}
                    />
                    <text x={cx} y={cy} textAnchor="middle" fontSize={size / 40} fill="#18181b" pointerEvents="none">{p.label}</text>
                    {roots.includes(p.id) ? <text x={cx} y={cy + size / 32} textAnchor="middle" fontSize={size / 55} fill="#2563eb" fontWeight="600" pointerEvents="none">{parts.length ? `BASE of ${pieceName(p.id).toLowerCase()}` : "BASE (stays flat)"}</text> : null}
                  </g>
                );
              })}
              <g fill="none" pointerEvents="none">
                <path d={flat.cut.map((p) => pathData(p.pts, p.closed)).join("")} stroke="#e6007e" strokeWidth={size / 450} />
                <path d={flat.crease.map((p) => pathData(p.pts, p.closed)).join("")} stroke="#00a0e9" strokeWidth={size / 450} strokeDasharray={`${size / 120} ${size / 240}`} />
              </g>
              {fold.hinges.map((h) => {
                const at = queue.indexOf(h.id);
                const on = quick ? at >= 0 : sel?.kind === "hinge" && sel.id === h.id;
                const [x1, y1, x2, y2] = h.line;
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <g key={h.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (quick) toggleQueued(h.id); else setSel({ kind: "hinge", id: h.id }); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={size / 40} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={h.angleDeg < 0 ? "#ea580c" : "#0f766e"} strokeWidth={size / (on ? 90 : 170)} strokeLinecap="round" />
                    <circle cx={mx} cy={my} r={size / (quick && at >= 0 ? 55 : 70)} fill={on ? "#2563eb" : quick ? "#71717a" : "#18181b"} />
                    <text x={mx} y={my + size / 190} textAnchor="middle" fontSize={size / 80} fill="#ffffff" pointerEvents="none">{quick ? (at >= 0 ? at + 1 : "") : h.order}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-xs text-muted-foreground">Colours show how deep a panel is from the base. Numbers on the fold lines are the fold steps. <span className="text-teal-700 dark:text-teal-300">Green</span> folds inward, <span className="text-orange-600">orange</span> outward.</p>
        </div>

        {/* 3D preview */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative overflow-hidden rounded-xl border bg-muted/40">
            {geo.geo ? (
              <CartonView ref={view} className="h-[min(420px,50vh)] w-full" geo={geo.geo} texture={null} textureRect={null} progress={progress} outsideColor="#ffffff" insideColor="#c8a97e" initialView={startView} />
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
            {geo.geo ? <><GridToggle viewRef={view} /><RotationControls viewRef={view} /></> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <label htmlFor="ground-panel" className="font-medium">Bottom (on the ground)</label>
            <select id="ground-panel" className={`${field} min-w-0 flex-1 basis-40`} value={fold.groundId ?? ""} onChange={(e) => onChange(setGround(fold, e.target.value || null))}>
              <option value="">Automatic</option>
              {fold.panels.map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
            </select>
            <p className="basis-full text-xs text-muted-foreground">The panel chosen here lies flat on the floor with its printed side down, like the bottom of a box. Pick the panel that is the base, and the box stands up on it.</p>
          </div>
          <p className="text-xs text-muted-foreground">Steps fold one after another. If the box looks wrong, check the angles, directions and steps on the left.</p>
        </div>
      </div>

      {parts.length ? (
        <section aria-label="Pieces" className="flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h3 className="text-sm font-semibold">This sheet has {parts.length + 1} pieces</h3>
            <p className="text-sm text-muted-foreground">Each piece folds on its own. The main body stays where it is; choose where every other piece (a lid, for example) goes in 3D. Customers see them together and resize them together.</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2">
              <strong>Main body</strong>
              <span className="text-muted-foreground">base: {label(fold.rootId)}. Stays in place.</span>
            </li>
            {parts.map((part) => (
              <li key={part.rootId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
                <strong>{pieceName(part.rootId)}</strong>
                <span className="text-muted-foreground">base: {label(part.rootId)}</span>
                <select
                  aria-label={`Where ${pieceName(part.rootId)} goes in 3D`}
                  className={`${field} ml-auto`}
                  value={part.placement.mode}
                  onChange={(e) => onChange(updatePart(fold, part.rootId, { mode: e.target.value as PartPlacementMode, ...(part.placement.openDeg === undefined ? {} : { openDeg: part.placement.openDeg }) }))}
                >
                  {PLACEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {part.placement.mode === "open" ? (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Lift
                    <input
                      aria-label={`How far ${pieceName(part.rootId)} is lifted, in degrees`}
                      className={`${field} w-16`}
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      value={part.placement.openDeg ?? 30}
                      onChange={(e) => onChange(updatePart(fold, part.rootId, { mode: "open", openDeg: Math.min(120, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                    />
                    °
                  </label>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(makeMain(fold, part.rootId))}>Make this the main body</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* inspector */}
      {selPanel ? (
        <section aria-label="Panel settings" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Name
            <input className={field} value={selPanel.label} maxLength={40} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { label: e.target.value }))} />
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium">
            <div className="flex items-center gap-1.5">
              <label htmlFor="panel-kind">Kind</label>
              <PanelKindHelp />
            </div>
            <select id="panel-kind" className={field} value={selPanel.role} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { role: e.target.value as PanelRole }))}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="text-xs font-normal text-muted-foreground">{ROLE_OPTIONS.find((r) => r.value === selPanel.role)?.hint}</span>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={selPanel.printable} onChange={(e) => onChange(updatePanel(fold, selPanel.id, { printable: e.target.checked }))} />
            Artwork can be printed here
          </label>
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
            Size: <strong className="text-foreground tabular-nums">{panelSize(selPanel.polygon).w.toFixed(1)} × {panelSize(selPanel.polygon).h.toFixed(1)} mm</strong> at the imported size, {selPanel.polygon.length / 2} corners.
          </p>
          <div className="flex flex-col items-start gap-2 self-end pb-1">
            <Button type="button" variant={fold.groundId === selPanel.id ? "default" : "outline"} size="sm" aria-pressed={fold.groundId === selPanel.id} onClick={() => onChange(setGround(fold, fold.groundId === selPanel.id ? null : selPanel.id))}>{fold.groundId === selPanel.id ? "On the ground (click to undo)" : "Put this on the ground"}</Button>
            {roots.includes(selPanel.id) ? <p className="text-sm text-muted-foreground">{parts.length ? `This is the base panel of the ${pieceName(selPanel.id).toLowerCase()}.` : "This is the base panel."}</p> : <Button type="button" variant="outline" size="sm" onClick={() => onChange(rootAt(fold, selPanel.id))}>{parts.length ? `Make this the base of its piece (${pieceName(roots[Math.max(0, pieceOf(fold, selPanel.id))]!).toLowerCase()})` : "Make this the base (stays flat)"}</Button>}
          </div>
        </section>
      ) : null}
      {selHinge ? (
        <section aria-label="Fold settings" className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{label(selHinge.parentId)} → {label(selHinge.childId)}</p>
          <p className="text-muted-foreground">
            {label(selHinge.childId)} swings about this fold line while {label(selHinge.parentId)} stays. Line length{" "}
            <strong className="tabular-nums text-foreground">{Math.hypot(selHinge.line[2] - selHinge.line[0], selHinge.line[3] - selHinge.line[1]).toFixed(1)} mm</strong>. Change step, angle and direction in the list below.
          </p>
        </section>
      ) : null}

      <HingeList hinges={hinges} label={label} selectedId={sel?.kind === "hinge" ? sel.id : null} onSelect={(id) => setSel({ kind: "hinge", id })} onSetHinge={setHinge} onMove={(id, to) => onChange(moveHinge(fold, id, to))} />
      <p className="-mt-2 text-xs text-muted-foreground">Drag a row by its handle (or focus it and press the up / down arrow keys) to change which fold happens first.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(compactOrders(fold))}>Tidy step numbers</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...fold, hinges: fold.hinges.map((h) => ({ ...h, angleDeg: Math.sign(h.angleDeg || 1) * 90 })) })}>Set every angle to 90°</Button>
      </div>
      {quick ? (
        <QuickSortBar
          bottom={barBottom}
          items={liveQueue.map((id) => ({ id, label: hingeName(id) }))}
          onReorder={setQueue}
          onRemove={(id) => setQueue((q) => q.filter((x) => x !== id))}
          onClear={() => setQueue([])}
          onCancel={stopQuick}
          onApply={() => { onChange(applyFoldSequence(fold, liveQueue)); stopQuick(); }}
        />
      ) : null}
    </div>
  );
}
