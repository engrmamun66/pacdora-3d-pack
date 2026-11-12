"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListOrdered, Play, RotateCcw, Wand2, X } from "lucide-react";
import { createImportedGenerator, detectFoldSetup, importedDefaults, validateFoldSetup, type DielineGeometry, type FlatDieline, type FoldHingeSpec, type FoldSetup, type PanelRole, partFits } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { applyFoldSequence, compactOrders, depthOf, makeMain, moveHinge, pieceMap, pieceNameOf, pieceOf, rootAt, rootsOf, setGround, sortedHinges, stepsOf, updateHinge, updatePanel } from "@/lib/fold-edit";
import { ConstructionEditor, PieceLinksEditor } from "./construction-editor";
import { HelpTip, InfoTip } from "./help-tip";
import { PiecesEditor } from "./pieces-editor";
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

/** The open fold tab of each template being edited. It lives outside the component so it survives the rebuild after a save. */
const openTabs = new Map<string, number>();

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
  memoryKey,
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
  /** Edit page: saving rebuilds this editor from the saved data. With a key, the open tab is remembered across that. */
  memoryKey?: string;
}) {
  const [sel, setSel] = useState<Sel>(null);
  // Which piece's fold list is shown (one tab per piece). Selecting something in the picture switches to its piece.
  const [tab, setTab] = useState(() => (memoryKey ? (openTabs.get(memoryKey) ?? 0) : 0));
  useEffect(() => {
    if (memoryKey) openTabs.set(memoryKey, tab);
  }, [memoryKey, tab]);
  const [seenSel, setSeenSel] = useState<Sel>(null);
  if (seenSel !== sel) {
    setSeenSel(sel);
    if (sel && fold) {
      const panelId = sel.kind === "panel" ? sel.id : fold.hinges.find((h) => h.id === sel.id)?.childId;
      const piece = panelId ? pieceMap(fold).get(panelId) : undefined;
      if (piece !== undefined && piece !== tab) setTab(piece);
    }
  }
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

  // Panel settings open in a dialog that slides down from the top; the last panel stays in it while it slides back up.
  const panelDialog = useRef<HTMLDialogElement>(null);
  const panelName = useRef<HTMLInputElement>(null);
  const selPanel = sel?.kind === "panel" ? fold?.panels.find((p) => p.id === sel.id) : undefined;
  const [lastPanel, setLastPanel] = useState(selPanel);
  if (selPanel && selPanel !== lastPanel) setLastPanel(selPanel);
  const shownPanel = selPanel ?? lastPanel;
  const panelOpen = selPanel !== undefined;
  useEffect(() => {
    const d = panelDialog.current;
    if (!d) return;
    if (panelOpen && !d.open) {
      d.showModal();
      // ready to rename: focus the Name field with its text selected
      panelName.current?.focus({ preventScroll: true });
      panelName.current?.select();
    } else if (!panelOpen && d.open) d.close();
  }, [panelOpen]);

  const fits = useMemo(() => (geo.geo ? partFits(geo.geo.foldTree) : []), [geo.geo]);

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
      const t = Math.min(1, (now - start) / Math.max(1500, 1200 * (fold ? Math.max(...rootsOf(fold).map((_, i) => stepsOf(fold, i).length), 1) * ((fold.parts ?? []).filter((q) => q.timing === "after").length + 1) : 1)));
      setProgress(t);
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };

  if (!fold) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <p className="text-sm">
          This template is <strong>flat only</strong>: customers can resize it, add artwork and export it, but there is no 3D view.{" "}
          <InfoTip label="3D view">To give it a 3D view, we find the panels between your cut and fold lines, then you check how each fold goes.</InfoTip>
        </p>
        <Button type="button" onClick={detect}><Wand2 className="size-4" aria-hidden /> Detect panels and folds</Button>
      </div>
    );
  }

  const pieceCount = (fold.parts?.length ?? 0) + 1;
  // The tabs under the pictures: one per piece, "Piece placement" and "Piece links" when there is more than one piece, then "Material & Paper".
  type TabKind = { k: "piece"; i: number } | { k: "placement" } | { k: "links" } | { k: "material" };
  const tabKinds: TabKind[] = [...Array.from({ length: pieceCount }, (_, i): TabKind => ({ k: "piece", i })), ...(pieceCount > 1 ? [{ k: "placement" } as TabKind, { k: "links" } as TabKind] : []), { k: "material" }];
  const tabNow = Math.min(tab, tabKinds.length - 1);
  const curTab = tabKinds[tabNow]!;
  const hingeName = (id: string) => {
    const h = fold.hinges.find((x) => x.id === id);
    return h ? `${label(h.parentId)} → ${label(h.childId)}` : id;
  };
  const liveQueue = queue.filter((id) => fold.hinges.some((h) => h.id === id));
  const toggleQueued = (id: string) => setQueue((q) => (q.includes(id) ? q.filter((x) => x !== id) : [...q, id]));
  const stopQuick = () => { setQuick(false); setQueue([]); };
  const selHinge = sel?.kind === "hinge" ? fold.hinges.find((h) => h.id === sel.id) : undefined;
  const setHinge = (id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>) => onChange(updateHinge(fold, id, patch));
  const steps = stepsOf(fold);
  const roots = rootsOf(fold);
  const parts = fold.parts ?? [];
  /** "Main body" or "Part 2" for the piece whose base panel is `rootId`. */
  const pieceName = (rootId: string) => pieceNameOf(fold, rootId);

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
          <div className="relative rounded-xl border bg-white p-2">
            <HelpTip label="About the colours and numbers">
              Colours show how deep a panel is from the base. Numbers on the fold lines are the fold steps. <span className="text-teal-700 dark:text-teal-300">Green</span> folds inward, <span className="text-orange-600">orange</span> outward.
            </HelpTip>
            <svg viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`} className="max-h-[60vh] w-full" role="img" aria-label="Flat sheet: panels in colour, fold lines numbered by fold step" onClick={() => setSel(null)}>
              {fold.panels.map((p) => {
                const d = depth.get(p.id) ?? 0;
                const on = sel?.kind === "panel" && sel.id === p.id;
                const [cx, cy] = centroid(p.polygon);
                // Names are 3x the old size, but never wider than their panel: a narrow panel turns its name or shrinks it.
                const xs = p.polygon.filter((_, i) => i % 2 === 0);
                const ys = p.polygon.filter((_, i) => i % 2 === 1);
                const pw = Math.max(...xs) - Math.min(...xs);
                const ph = Math.max(...ys) - Math.min(...ys);
                const nameLen = Math.max(1, p.label.length) * 0.56;
                const fsMax = (size / 40) * 3;
                const flatFs = Math.min(fsMax, (pw * 0.92) / nameLen, ph * 0.5);
                const turnedFs = Math.min(fsMax, (ph * 0.92) / nameLen, pw * 0.8);
                const turn = turnedFs > flatFs * 1.15;
                const nameFs = turn ? turnedFs : flatFs;
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
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={nameFs} fill="#18181b" pointerEvents="none" {...(turn ? { transform: `rotate(-90 ${cx} ${cy})` } : {})}>{p.label}</text>
                    {roots.includes(p.id) ? <text x={cx} y={cy + nameFs * (turn ? 0 : 0.95)} {...(turn ? { dx: nameFs * 0.95 } : {})} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(size / 55, nameFs * 0.45)} fill="#2563eb" fontWeight="600" pointerEvents="none">{parts.length ? `BASE of ${pieceName(p.id).toLowerCase()}` : "BASE (stays flat)"}</text> : null}
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
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <label htmlFor="ground-panel" className="font-medium">Bottom (on the ground)</label>
            <InfoTip label="Bottom (on the ground)">The panel chosen here lies flat on the floor with its printed side down, like the bottom of a box. Pick the panel that is the base, and the box stands up on it.</InfoTip>
            <select id="ground-panel" className={`${field} min-w-0 flex-1 basis-40`} value={fold.groundId ?? ""} onChange={(e) => onChange(setGround(fold, e.target.value || null))}>
              <option value="">Automatic</option>
              {fold.panels.map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
            </select>
          </div>
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
        </div>
      </div>


      {/* inspector */}
      {/* Panel settings: a dialog that slides down from the top when a panel is clicked */}
      <dialog
        ref={panelDialog}
        aria-labelledby="panel-dialog-title"
        // React hands a close event of the help dialog inside this popup up to this handler: only this popup's own counts.
        onClose={(e) => { if (e.target === e.currentTarget) setSel((cur) => (cur?.kind === "panel" ? null : cur)); }}
        onClick={(e) => { if (e.target === panelDialog.current) panelDialog.current?.close(); }}
        className="drop-dialog w-[min(56rem,calc(100vw-1rem))] rounded-b-2xl border border-t-0 bg-background p-0 text-foreground shadow-2xl"
      >
        {shownPanel ? (
          <form
            onSubmit={(e) => {
              // Enter in a field: the changes are already applied as you type, so submitting just closes the panel.
              e.preventDefault();
              panelDialog.current?.close();
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <h2 id="panel-dialog-title" className="min-w-0 truncate font-semibold">Panel: {shownPanel.label || shownPanel.id}</h2>
              <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => panelDialog.current?.close()}><X className="size-4" /></button>
            </div>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5">
          <label className="flex w-full flex-col gap-1 text-sm font-medium sm:w-56">Name
            <input ref={panelName} className={field} value={shownPanel.label} maxLength={40} onChange={(e) => onChange(updatePanel(fold, shownPanel.id, { label: e.target.value }))} />
          </label>
          <div className="flex w-full flex-col gap-1 text-sm font-medium sm:w-64">
            <div className="flex items-center gap-1.5">
              <label htmlFor="panel-kind">Kind</label>
              <PanelKindHelp />
              <InfoTip label="This kind">{ROLE_OPTIONS.find((r) => r.value === shownPanel.role)?.hint ?? ""}</InfoTip>
            </div>
            <select id="panel-kind" className={field} value={shownPanel.role} onChange={(e) => onChange(updatePanel(fold, shownPanel.id, { role: e.target.value as PanelRole }))}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {/* Same shape as the fields beside it (an empty label line, then a 36px row), so the checkbox sits level with the inputs. */}
          <div className="flex flex-col gap-1">
            <span aria-hidden className="h-5" />
            <label className="flex min-h-9 items-center gap-2 whitespace-nowrap text-sm">
              <input type="checkbox" className="size-4 shrink-0" checked={shownPanel.printable} onChange={(e) => onChange(updatePanel(fold, shownPanel.id, { printable: e.target.checked }))} />
              Artwork can be printed here
            </label>
          </div>
          <p className="basis-full text-sm text-muted-foreground">
            Size: <strong className="text-foreground tabular-nums">{panelSize(shownPanel.polygon).w.toFixed(1)} × {panelSize(shownPanel.polygon).h.toFixed(1)} mm</strong> at the imported size, {shownPanel.polygon.length / 2} corners.
          </p>
          <div className="flex basis-full flex-wrap items-center gap-2">
            <Button type="button" variant={fold.groundId === shownPanel.id ? "default" : "outline"} size="sm" aria-pressed={fold.groundId === shownPanel.id} onClick={() => onChange(setGround(fold, fold.groundId === shownPanel.id ? null : shownPanel.id))}>{fold.groundId === shownPanel.id ? "On the ground (click to undo)" : "Put this on the ground"}</Button>
            {roots.includes(shownPanel.id) ? <p className="text-sm text-muted-foreground">{parts.length ? `This is the base panel of the ${pieceName(shownPanel.id).toLowerCase()}.` : "This is the base panel."}</p> : <Button type="button" variant="outline" size="sm" onClick={() => onChange(rootAt(fold, shownPanel.id))}>{parts.length ? `Make this the base of its piece (${pieceName(roots[Math.max(0, pieceOf(fold, shownPanel.id))]!).toLowerCase()})` : "Make this the base (stays flat)"}</Button>}
          </div>
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button type="submit">Done</Button>
            </div>
          </form>
        ) : null}
      </dialog>
      {selHinge ? (
        <section aria-label="Fold settings" className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{label(selHinge.parentId)} → {label(selHinge.childId)}</p>
          <p className="text-muted-foreground">
            Line length <strong className="tabular-nums text-foreground">{Math.hypot(selHinge.line[2] - selHinge.line[0], selHinge.line[3] - selHinge.line[1]).toFixed(1)} mm</strong>.{" "}
            <InfoTip label="Fold settings">{label(selHinge.childId)} swings about this fold line while {label(selHinge.parentId)} stays. Change step, angle and direction in the list below.</InfoTip>
          </p>
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="Fold lines, piece placement and material" className="flex flex-wrap gap-1 border-b">
          {tabKinds.map((t, n) => (
            <button
              key={t.k === "piece" ? roots[t.i] : t.k}
              type="button"
              role="tab"
              id={`fold-tab-${n}`}
              aria-selected={n === tabNow}
              aria-controls="fold-tabpanel"
              tabIndex={n === tabNow ? 0 : -1}
              onClick={() => setTab(n)}
              onKeyDown={(e) => {
                const to = e.key === "ArrowRight" ? (n + 1) % tabKinds.length : e.key === "ArrowLeft" ? (n + tabKinds.length - 1) % tabKinds.length : null;
                if (to === null) return;
                e.preventDefault();
                setTab(to);
                document.getElementById(`fold-tab-${to}`)?.focus();
              }}
              className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${n === tabNow ? "border-border bg-background font-medium" : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
            >
              {t.k === "piece" ? (
                <>
                  {pieceName(roots[t.i]!)}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{sortedHinges(fold, t.i).length} folds</span>
                </>
              ) : t.k === "placement" ? "Piece placement" : t.k === "links" ? "Piece links" : "Material & Paper"}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="fold-tabpanel" aria-labelledby={`fold-tab-${tabNow}`} className="flex flex-col gap-2">
          {curTab.k === "placement" ? (
            <PiecesEditor fold={fold} fits={fits} label={label} onChange={onChange} />
          ) : curTab.k === "links" ? (
            stale ? <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Detect the panels again first: the lines changed after the fold was set up.</p> : <PieceLinksEditor fold={fold} onChange={onChange} />
          ) : curTab.k === "material" ? (
            stale ? <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Detect the panels again first: the lines changed after the fold was set up.</p> : <ConstructionEditor fold={fold} onChange={onChange} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {pieceCount > 1 ? `${stepsOf(fold, curTab.i).length} ${stepsOf(fold, curTab.i).length === 1 ? "step" : "steps"}` : "Steps"}
                  <InfoTip label="Steps">
                    {pieceCount > 1 ? `${pieceName(roots[curTab.i]!)} has its own steps. ` : ""}Lines with the same step number fold together. Drag a row by its handle (or focus it and press the up / down arrow keys) to change which fold happens first. Type a step number to fold several lines together: give them the same number.
                  </InfoTip>
                </p>
                {curTab.i > 0 ? <Button type="button" variant="outline" size="xs" onClick={() => onChange(makeMain(fold, roots[curTab.i]!))}>Make main body</Button> : null}
              </div>
              {sortedHinges(fold, curTab.i).length ? (
                <HingeList hinges={sortedHinges(fold, curTab.i)} label={label} selectedId={sel?.kind === "hinge" ? sel.id : null} onSelect={(id) => setSel({ kind: "hinge", id })} onSetHinge={setHinge} onMove={(id, to) => onChange(moveHinge(fold, id, to))} />
              ) : (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">This piece has no fold lines.</p>
              )}
            </>
          )}
        </div>
      </div>
      {curTab.k === "piece" ? (
        <>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(compactOrders(fold))}>Tidy step numbers</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...fold, hinges: fold.hinges.map((h) => ({ ...h, angleDeg: Math.sign(h.angleDeg || 1) * 90 })) })}>Set every angle to 90°</Button>
        </div>
        </>
      ) : null}
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
