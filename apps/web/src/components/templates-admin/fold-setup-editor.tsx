"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, ListOrdered, Merge, Pencil, Play, Redo2, RotateCcw, Scissors, Undo2, Wand2, X } from "lucide-react";
import { applyWindows, createImportedGenerator, detectFoldSetup, THICKNESS_RANGE, validateFoldSetup, type DielineGeometry, type FlatDieline, type FoldHingeSpec, type FoldRing, type FoldSetup, type PanelRole, type WindowSpec, partFits } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { applyFoldSteps, depthOf, makeBase, makeMain, moveHinge, pieceMap, pieceNameOf, pieceOf, rootsOf, setGround, setStepNumber, sortedHinges, stepsOf, updateHinge, updatePanel } from "@/lib/fold-edit";
import { cutPreview, mergePanels, panelAt, splitPanel, type PanelEdit } from "@/lib/panel-edit";
import { notify } from "@/lib/notify";
import { ConstructionEditor, PieceLinksEditor } from "./construction-editor";
import { HelpTip, InfoTip } from "./help-tip";
import { PiecesEditor } from "./pieces-editor";
import { HingeList, StepNumberTool } from "./hinge-list";
import { FoldRowPanel } from "./fold-row-panel";
import { FoldSeamsDialog } from "./fold-seams-dialog";
import { PanelKindHelp } from "./panel-kind-help";
import { confirmAction } from "@/lib/confirm";
import { QUICK_SLIDE_MS, QuickSortBar } from "./quick-sort-bar";
import type { ViewSettings } from "@/lib/view-settings";
import { GridToggle } from "@/components/viewer3d/grid-toggle";
import { RotationControls } from "@/components/viewer3d/rotation-controls";
import { pathData } from "@/lib/template-import";
import { importedStartParams } from "@/lib/imported-start";
import { materialFor, materialsFor, MATERIAL_TYPES, type Unit } from "@/components/dielines/units";
import { boardLookOf } from "@/lib/board-look";
import { WindowEditorModal } from "./window-editor-modal";
import { RangeSlider } from "@/components/ui/range-slider";

/** The "Bottom (on the ground)" picker is hidden for now (the code stays; set this to true to show it again). A ground panel set earlier still applies. */
const SHOW_GROUND_PICKER = false;

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
  onChange: emit,
  stale,
  onQuickChange,
  onEditLines,
  startView = null,
  memoryKey,
  windows = [],
  onWindows,
}: {
  /** Window holes new projects start with. They are cut into the 3D preview here. */
  windows?: readonly WindowSpec[];
  /** Given, the "Window holes" button opens the window editor and reports the result. */
  onWindows?: (w: WindowSpec[]) => void;
  flat: FlatDielineData;
  fold: FoldSetup | null;
  onChange: (f: FoldSetup | null) => void;
  /** True when the lines changed after the fold was set up: it must be detected again or removed. */
  stale: boolean;
  /** Given, an "Edit fold lines" button (next to Detect again) opens the raw data of the fold lines. */
  onEditLines?: () => void;
  /** Told when Quick sort opens or closes, so the page can clear the bottom of the window for it. */
  onQuickChange?: (open: boolean) => void;
  /** The template's saved starting 3D view: the preview opens with it, returns to it on reset, and moves to it when it changes. */
  startView?: ViewSettings | null;
  /** Edit page: saving rebuilds this editor from the saved data. With a key, the open tab is remembered across that. */
  memoryKey?: string;
}) {
  const [sel, setSel] = useState<Sel>(null);
  /** "Blink mode": hovering a panel on the flat sheet makes the same panel blink softly on the 3D box. */
  // Blink Mode is always on: the panel under the mouse blinks on the 3D box. (No switch is shown for it.)
  const blinkMode = true;
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The panel under the mouse in the 3D view: it is lit on the flat sheet.
  const [hover3d, setHover3d] = useState<string | null>(null);
  // The fold line whose chip in the Quick sort bar is under the pointer: its panel is lit on the sheet and on the 3D box.
  const [sortHover, setSortHover] = useState<string | null>(null);
  // Hand tools for the panels: "merge" (click a fold line to join the two panels it separates) and "split" (two clicks draw a cut across a panel).
  const [tool, setTool] = useState<"merge" | "split" | null>(null);
  const [cutFrom, setCutFrom] = useState<[number, number] | null>(null);
  const [cutTo, setCutTo] = useState<[number, number] | null>(null);
  const [mergeHover, setMergeHover] = useState<string | null>(null);
  // Undo / redo of every change to the fold setup (panels, steps, angles, names...), also with Ctrl / Cmd + Z and Ctrl + Y / Ctrl + Shift + Z.
  // Changes that come one right after the other (typing a name, dragging a slider) count as one step.
  const [history, setHistory] = useState<{ past: FoldSetup[]; future: FoldSetup[]; at: FoldSetup | null; hot: boolean }>({ past: [], future: [], at: fold, hot: false });
  if (history.at !== fold && (history.past.length > 0 || history.future.length > 0)) setHistory({ past: [], future: [], at: fold, hot: false }); // the setup was replaced from outside
  const onChange = (f: FoldSetup | null) => {
    if (fold && f !== fold) {
      // "hot" lasts half a second after a change: changes in that time (typing, dragging) join the step before.
      const together = history.hot && history.past.length > 0;
      setHistory((h) => ({ past: together ? h.past : [...h.past.slice(-99), fold], future: [], at: f, hot: true }));
      window.setTimeout(() => setHistory((h) => (h.hot ? { ...h, hot: false } : h)), 500);
    }
    emit(f);
  };
  const undoEdit = () => {
    const prev = history.past[history.past.length - 1];
    if (!prev || !fold) return;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [fold, ...h.future], at: prev, hot: false }));
    emit(prev);
    setSel(null);
  };
  const redoEdit = () => {
    const next = history.future[0];
    if (!next || !fold) return;
    setHistory((h) => ({ past: [...h.past, fold], future: h.future.slice(1), at: next, hot: false }));
    emit(next);
    setSel(null);
  };
  const historyKeys = useRef({ undo: undoEdit, redo: redoEdit });
  useEffect(() => {
    historyKeys.current = { undo: undoEdit, redo: redoEdit };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const redo = (k === "z" && e.shiftKey) || (k === "y" && !e.metaKey && !e.shiftKey);
      if (k !== "z" && !redo) return;
      const t = e.target;
      // Typing in a field keeps the browser's own undo; so does an open dialog (the window editor has its own).
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (document.querySelector("dialog[open], [role='dialog']")) return;
      e.preventDefault();
      if (redo) historyKeys.current.redo();
      else historyKeys.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const sheetSvg = useRef<SVGSVGElement>(null);
  // Size of the panel names on the flat sheet: "sm" (about 60% of the usual size) at first; "mid" is the usual size.
  const [labelSize, setLabelSize] = useState<"sm" | "mid">("sm");
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (cutFrom) {
        setCutFrom(null);
        setCutTo(null);
      } else setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, cutFrom]);
  // The fold line of the panel just clicked while Quick sort is open: its row in the steps table is lit (the page does not scroll to it).
  const [picked, setPicked] = useState<string | null>(null);
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
  // Quick sort: while on, a click on a fold line (or the panel it swings) adds it to `queue` with the step now chosen
  // (1 at first; "Add step" moves on to the next one, and the lines clicked from then on take that step).
  const [quick, setQuick] = useState(false);
  const [quickClosing, setQuickClosing] = useState(false);
  useEffect(() => {
    onQuickChange?.(quick);
    return () => onQuickChange?.(false);
  }, [quick, onQuickChange]);
  const [queue, setQueue] = useState<{ id: string; step: number }[]>([]);
  const [quickStep, setQuickStep] = useState(1);
  // How many steps the bar shows. Empty steps stay in the bar (they are dropped when the sort is applied), so a line can be added to any of them.
  const [quickCount, setQuickCount] = useState(1);
  // The fold line whose row is open in a dialog (opened from a chip of the Quick sort bar).
  const [editHinge, setEditHinge] = useState<string | null>(null);
  // "Preview 3D folding" in the Quick sort bar: while on, the 3D box folds in the order being sorted (steps of the clicked lines first).
  const [previewSort, setPreviewSort] = useState(true);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [progress, setProgress] = useState(startView?.progress ?? 1);
  const view = useRef<CartonViewHandle>(null);
  // Sheet | 3D side by side (xl and up): share (%) of the width the sheet takes, set by dragging the divider between them.
  const splitBox = useRef<HTMLDivElement>(null);
  const splitDrag = useRef<number | null>(null);
  const [splitPct, setSplitPct] = useState(40);
  const anim = useRef<number | null>(null);
  // The board picked on the "Material & Paper" tab (null = not picked: the family is guessed from the thickness). The 3D preview shows its colour, grain, cut edge and thickness.
  const [pickedMaterial, setPickedMaterial] = useState<string | null>(null);

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

  // The flat sheet seen from above is the dieline turned over (up and down swapped), because the box folds upward and the print faces down.
  // So when the sheet is fully open, the camera goes below it and shows it the way the dieline is drawn; when it folds, the camera goes back.
  // Not while the view is locked, and not after the person moved the camera themselves while the sheet was open.
  const flatNow = progress < 0.005;
  const wasFlat = useRef(flatNow);
  const turnedFrom = useRef<ViewSettings | null>(null);
  const lookFromBelow = (smooth: boolean) => {
    const h = view.current;
    if (!h || h.isKeepView()) return;
    const now = h.getView();
    if (!now || now.elevationDeg <= -60) return; // already below
    turnedFrom.current = now;
    const to = { ...now, azimuthDeg: 0, elevationDeg: -89, rollDeg: 0 };
    if (smooth) h.setViewSmooth(to);
    else h.setView(to);
  };
  useEffect(() => {
    if (wasFlat.current === flatNow) return;
    wasFlat.current = flatNow;
    if (flatNow) lookFromBelow(true);
    else if (turnedFrom.current && view.current) {
      const now = view.current.getView();
      if (now) view.current.setViewSmooth({ ...turnedFrom.current, progress: now.progress });
      turnedFrom.current = null;
    }
  });
  // A sheet that is already open when the preview first appears (its start view or a fold amount of 0) is turned at once.
  const onViewReady = () => {
    if (flatNow) lookFromBelow(false);
  };

  // Rings of panels found by the last detection (petals around a corner, for example): one fold line of each stays open, and the admin may choose which.
  const [rings, setRings] = useState<readonly FoldRing[]>([]);
  const [seamsOpen, setSeamsOpen] = useState(false);
  const detect = (openLines?: readonly (readonly number[])[]) => {
    const r = detectFoldSetup(flat as FlatDieline, openLines ? { openLines } : {});
    setWarnings(r.warnings);
    setRings(r.loops ?? []);
    setSeamsOpen(false);
    setEditHinge(null);
    setSel(null);
    setQuick(false);
    setQueue([]);
    setQuickStep(1);
    setQuickCount(1);
    onChange(r.setup);
  };

  /** "Detect again" starts the whole fold setup over, so it asks first. */
  const detectAgain = async () => {
    const ok = await confirmAction({
      title: "Detect panels and folds again?",
      description: "This resets the fold setup: panel names and kinds, the base, the bottom, fold steps, directions and angles go back to what is detected. Window holes are kept. This cannot be undone.",
      confirmLabel: "Detect again",
    });
    if (ok) detect();
  };

  const problems = useMemo(() => (fold ? validateFoldSetup(fold) : []), [fold]);
  const geo = useMemo<{ geo: DielineGeometry | null; error: string | null; thickness?: number }>(() => {
    if (!fold || problems.length || stale) return { geo: null, error: null };
    try {
      const f = flat as FlatDieline;
      const params = importedStartParams(flat, fold);
      const shown = quick && previewSort && queue.length > 0 ? applyFoldSteps(fold, queue) : fold;
      return { geo: createImportedGenerator("preview", f, shown).generate(params), error: null, thickness: params.thickness };
    } catch (e) {
      return { geo: null, error: e instanceof Error ? e.message : "The 3D preview could not be built." };
    }
  }, [fold, problems, stale, flat, quick, previewSort, queue]);

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

  // Window holes: cut into the preview (the ones that do not fit the dieline any more are left out here and flagged on the page).
  const [windowsOpen, setWindowsOpen] = useState(false);
  const [windowUnit, setWindowUnit] = useState<Unit>("mm");
  const windowResult = useMemo(() => (geo.geo && windows.length > 0 ? applyWindows(geo.geo, windows) : null), [geo.geo, windows]);
  const shownGeo = windowResult ? windowResult.geo : geo.geo;
  // The board in the 3D preview: the picked family (or the one that fits the thickness), with its look and the real thickness.
  const boardThickness = geo.thickness ?? 0;
  const boardTypeId = pickedMaterial ?? materialFor(boardThickness || 0.5, materialsFor(THICKNESS_RANGE.min, THICKNESS_RANGE.max)).typeId;
  const boardLook = boardLookOf(boardTypeId);
  const boardColor = MATERIAL_TYPES.find((t) => t.id === boardTypeId)?.color ?? "#c9a574";
  // Blink Mode: the panel under the mouse on the flat sheet blinks on the 3D box (the box keeps it across rebuilds).
  const sortHinge = quick && sortHover && queue.some((q) => q.id === sortHover) ? fold?.hinges.find((h) => h.id === sortHover) ?? null : null;
  const sortPanel = sortHinge?.childId ?? null;
  const blinkTarget = blinkMode ? sortPanel ?? hoverId ?? hover3d : null;
  useEffect(() => {
    view.current?.focusPanel(blinkTarget);
  }, [blinkTarget, shownGeo]);
  // "Show labels on 3D view": the name of each panel is written on it in the 3D box (the names are the ones on the flat sheet).
  const [showLabels, setShowLabels] = useState(true);
  const labelNames = useMemo(() => (showLabels && fold ? Object.fromEntries(fold.panels.map((p) => [p.id, p.label || p.id])) : null), [showLabels, fold]);
  useEffect(() => {
    view.current?.setPanelLabels(labelNames);
  }, [labelNames, shownGeo]);
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
  // Zoom and pan of the flat sheet: the wheel zooms toward the pointer, a drag moves the sheet. `view` is null while the whole sheet is shown.
  const base = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + 2 * pad, h: bounds.h + 2 * pad };
  const [zoomed, setZoomed] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  });
  const boundsKey = `${bounds.x}|${bounds.y}|${bounds.w}|${bounds.h}`;
  const [seenBounds, setSeenBounds] = useState(boundsKey);
  if (seenBounds !== boundsKey) {
    setSeenBounds(boundsKey);
    setZoomed(null); // a different sheet: show all of it again
  }
  const zoomBy = (factor: number, at?: [number, number]) =>
    setZoomed((cur) => {
      const b = baseRef.current;
      const v = cur ?? b;
      const w = Math.min(b.w * 1.5, Math.max(b.w / 30, v.w / factor));
      const k = w / v.w;
      const h = v.h * k;
      const px = at ? at[0] : v.x + v.w / 2;
      const py = at ? at[1] : v.y + v.h / 2;
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h };
    });
  const hasFold = fold !== null;
  useEffect(() => {
    const svg = sheetSvg.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const at = pt.matrixTransform(ctm.inverse());
      zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), [at.x, at.y]);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hasFold]);
  const dragged = useRef(false);
  const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button > 2) return; // left, middle or right button
    const svg = sheetSvg.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    dragged.current = false;
    const from = { x: e.clientX, y: e.clientY };
    const origin = zoomed ?? base;
    const unit = 1 / ctm.a; // sheet millimetres per screen pixel
    const move = (m: PointerEvent) => {
      const dx = m.clientX - from.x;
      const dy = m.clientY - from.y;
      if (!dragged.current && Math.hypot(dx, dy) < 5) return;
      dragged.current = true;
      setZoomed({ ...origin, x: origin.x - dx * unit, y: origin.y - dy * unit });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
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
          This template is <strong>flat only</strong>: clients can resize it, add artwork and export it, but there is no 3D view.{" "}
          <InfoTip label="3D view">To give it a 3D view, we find the panels between your cut and fold lines, then you check how each fold goes.</InfoTip>
        </p>
        <Button type="button" variant="dark" onClick={() => detect()}><Wand2 className="size-4" aria-hidden /> Detect panels and folds</Button>
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
    return h ? label(h.childId) : id;
  };
  const liveQueue = queue.filter((it) => fold.hinges.some((h) => h.id === it.id));
  const stepsShown = Math.max(quickCount, quickStep, ...liveQueue.map((it) => it.step));
  // A click on a line adds it to the chosen step; a line that is already in another step moves to it; a click in its own step takes it out.
  const toggleQueued = (id: string) => {
    setPicked(id);
    if (editHinge) setEditHinge(id); // the side panel follows the panel clicked, wherever it is clicked
    const piece = pieceMap(fold).get(fold.hinges.find((h) => h.id === id)?.childId ?? "");
    if (piece !== undefined) setTab(piece); // show the table of the piece this line belongs to
    setQueue((q) => {
      const at = q.find((x) => x.id === id);
      if (!at) return [...q, { id, step: quickStep }];
      if (at.step !== quickStep) return q.map((x) => (x.id === id ? { ...x, step: quickStep } : x));
      return q.filter((x) => x.id !== id);
    });
  };
  // Quick sort: a click on a panel in the 3D view picks its fold line, like a click on the panel in the flat sheet.
  const onPanel3dClick = (id: string) => {
    if (!quick || quickClosing) return;
    const h = fold.hinges.find((x) => x.childId === id);
    if (h) toggleQueued(h.id);
  };
  // The part(s) being sorted: the pieces the clicked lines belong to; before any click, the piece of the open tab. Only for a sheet with several pieces.
  const sortingParts = (() => {
    if (pieceCount < 2) return undefined;
    const map = pieceMap(fold);
    const used = [...new Set(liveQueue.map((it) => map.get(fold.hinges.find((h) => h.id === it.id)?.childId ?? "") ?? 0))].sort((a, b) => a - b);
    const shown = used.length ? used : [curTab.k === "piece" ? curTab.i : 0];
    return shown.map((i) => pieceNameOf(fold, rootsOf(fold)[i] ?? fold.rootId));
  })();
  // Hand edits of the panels (merge, split).
  const applyEdit = (r: PanelEdit, done: string) => {
    if (!r.setup) {
      notify.error(r.error ?? "That edit could not be done.");
      return false;
    }
    onChange(r.setup);
    setSel(null);
    setMergeHover(null);
    setCutFrom(null);
    setCutTo(null);
    notify.success(done);
    return true;
  };
  const pickTool = (t: "merge" | "split") => {
    setTool((cur) => (cur === t ? null : t));
    setCutFrom(null);
    setCutTo(null);
    setMergeHover(null);
    if (quick) closeQuick();
  };
  const toSheet = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const svg = sheetSvg.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return [r.x, r.y];
  };
  const onSheetClick = (e: React.MouseEvent) => {
    if (tool !== "split") return setSel(null);
    const at = toSheet(e);
    if (!at) return;
    if (!cutFrom) {
      if (!panelAt(fold, at)) return notify.error("Start the cut inside a panel.");
      setCutFrom(at);
      return;
    }
    const id = panelAt(fold, cutFrom);
    if (id) applyEdit(splitPanel(fold, id, cutFrom, at), "Panel split in two. Set its fold angle in the list below.");
  };
  const chord = tool === "split" && cutFrom && cutTo ? cutPreview(fold, cutFrom, cutTo) : null;
  const mergePair = tool === "merge" && mergeHover ? fold.hinges.find((h) => h.id === mergeHover) ?? null : null;
  const stopQuick = () => { setQuick(false); setSortHover(null); setPicked(null); setEditHinge(null); setQueue([]); setQuickStep(1); setQuickCount(1); setPreviewSort(true); };
  // "Sort again": Quick sort opens with this piece's lines already grouped in the steps they have now, and an empty step after them.
  const sortAgain = () => {
    const orders = stepsOf(fold, curTab.k === "piece" ? curTab.i : 0);
    setQueue(sortedHinges(fold, curTab.k === "piece" ? curTab.i : 0).map((h) => ({ id: h.id, step: orders.indexOf(h.order) + 1 })));
    setQuickCount(orders.length + 1);
    setQuickStep(orders.length + 1);
    setQuickClosing(false);
    setQuick(true);
    setSel(null);
  };
  // Closing slides the bar down first and only then lets go of the sort, so it does not empty out while it leaves.
  const closeQuick = () => {
    if (quickClosing) return;
    setQuickClosing(true);
    window.setTimeout(() => {
      stopQuick();
      setQuickClosing(false);
    }, QUICK_SLIDE_MS);
  };
  // Give a queued line another step (dragged into it, or moved with the keys); the list stays in step order.
  const setQueuedStep = (id: string, step: number) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, step: Math.max(1, step) } : x)).sort((a, b) => a.step - b.step));
  // Drop a step and its lines; later steps move up one. The open step follows, and never goes below 1.
  const removeQueuedStep = (n: number) => {
    setQueue((q) => q.filter((x) => x.step !== n).map((x) => (x.step > n ? { ...x, step: x.step - 1 } : x)));
    setQuickStep((cur) => (cur >= n ? Math.max(1, cur - 1) : cur));
    setQuickCount(Math.max(1, stepsShown - 1));
  };
  const selHinge = sel?.kind === "hinge" ? fold.hinges.find((h) => h.id === sel.id) : undefined;
  const setHinge = (id: string, patch: Partial<Pick<FoldHingeSpec, "angleDeg" | "order">>) => onChange(updateHinge(fold, id, patch));
  const steps = stepsOf(fold);
  const roots = rootsOf(fold);
  const parts = fold.parts ?? [];
  /** "Main body" or "Part 2" for the piece whose base panel is `rootId`. */
  const pieceName = (rootId: string) => pieceNameOf(fold, rootId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="dark" size="sm" aria-pressed={quick} onClick={() => (quick ? closeQuick() : (setTool(null), setCutFrom(null), setQuick(true), setSel(null)))}><ListOrdered className="size-4" aria-hidden /> Quick sort</Button>
          <Button type="button" variant="dark" size="sm" aria-pressed={tool === "merge"} disabled={stale} title="Join two panels into one: click the fold line between them" onClick={() => pickTool("merge")}><Merge className="size-4" aria-hidden /> Merge panels</Button>
          <Button type="button" variant="dark" size="sm" aria-pressed={tool === "split"} disabled={stale} title="Cut a panel in two: click two points to draw the cut line" onClick={() => pickTool("split")}><Scissors className="size-4" aria-hidden /> Split panel</Button>
          <Button type="button" variant="dark" size="sm" disabled={history.past.length === 0} title="Undo the last change (Ctrl / Cmd + Z)" aria-keyshortcuts="Control+Z Meta+Z" onClick={undoEdit}><Undo2 className="size-4" aria-hidden /> Undo</Button>
          <Button type="button" variant="dark" size="sm" disabled={history.future.length === 0} title="Redo (Ctrl + Y, or Ctrl / Cmd + Shift + Z)" aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z" onClick={redoEdit}><Redo2 className="size-4" aria-hidden /> Redo</Button>
          <Button type="button" variant="dark" size="sm" onClick={() => void detectAgain()}><Wand2 className="size-4" aria-hidden /> Detect again</Button>
          {onEditLines ? <Button type="button" variant="dark" size="sm" onClick={onEditLines} title="Change the fold lines as raw data, to make a line longer or shorter. Then press Detect again."><Pencil className="size-4" aria-hidden /> Edit fold lines</Button> : null}
          {onWindows ? (
            <Button type="button" variant="dark" size="sm" className="ml-auto" disabled={!geo.geo} title={geo.geo ? "Cut window holes that new projects start with" : "Set up the 3D fold first"} onClick={() => setWindowsOpen(true)}>
              <AppWindow className="size-4" aria-hidden /> Window holes{windows.length > 0 ? <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{windows.length}</span> : null}
            </Button>
          ) : null}
        </div>
      </div>

      {tool ? (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {tool === "merge"
            ? "Merge: click the fold line (the numbered dot) between two panels to join them into one. Esc to stop."
            : cutFrom
              ? "Split: now click a second point. The cut runs through both points, from one edge of the panel to the other (nearly straight cuts snap to horizontal or vertical). Esc to start again."
              : "Split: click a point inside the panel you want to cut. Esc to stop."}
        </p>
      ) : null}
      {windowResult && windowResult.problems.length > 0 ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {windowResult.problems.length === 1 ? "A window hole does not fit" : `${windowResult.problems.length} window holes do not fit`} the dieline: {windowResult.problems[0]!.message} Open Window holes and move or delete {windowResult.problems.length === 1 ? "it" : "them"}; saving is blocked until then.
        </p>
      ) : null}
      {stale ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">The lines changed after the fold was set up. Detect the panels again before saving.</p> : null}
      {problems.length ? <ul role="alert" className="list-disc rounded-lg border border-destructive/30 bg-destructive/10 py-2 pl-7 pr-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {rings.length ? (
        <section aria-label="Slits" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <Scissors className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong>{rings.length} {rings.length === 1 ? "circle of panels needs" : "circles of panels need"} a slit.</strong> Panels joined in a circle (like the petals around a corner) cannot all fold along every line, so one fold line of each circle stays open. We picked one for each; check them.
          </p>
          <Button type="button" variant="dark" size="sm" onClick={() => setSeamsOpen(true)}><Scissors className="size-4" aria-hidden /> Set the slits</Button>
        </section>
      ) : null}
      {seamsOpen && rings.length > 0 && fold ? (
        <FoldSeamsDialog
          rings={rings}
          panels={fold.panels.map((p) => ({ id: p.id, label: p.label || p.id, polygon: p.polygon }))}
          cut={flat.cut.map((p) => ({ pts: [...p.pts], closed: p.closed }))}
          label={label}
          onClose={() => setSeamsOpen(false)}
          onApply={(seams) => detect(seams)}
        />
      ) : null}
      {warnings.length ? (
        <details className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{warnings.length} note{warnings.length === 1 ? "" : "s"} from the detection</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      ) : null}

      <div ref={splitBox} style={{ "--split": `${splitPct}%` } as React.CSSProperties} className="flex flex-col gap-4 xl:flex-row xl:gap-0">
        {/* flat sheet with panels and fold lines */}
        <div className="flex min-w-0 flex-col gap-2 xl:flex-none xl:basis-(--split) xl:pr-2">
          <div className="relative rounded-xl border bg-white p-2">
            <div role="group" aria-label="Size of the panel names" className="absolute top-2 left-2 z-10 flex overflow-hidden rounded-md border bg-background/90 text-[11px] leading-none shadow-xs">
              {([["sm", "Sm", "Small panel names"], ["mid", "Mid", "Medium panel names"]] as const).map(([v, text, tip]) => (
                <button key={v} type="button" aria-pressed={labelSize === v} title={tip} onClick={() => setLabelSize(v)} className={`px-2 py-1 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${labelSize === v ? "bg-black text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{text}</button>
              ))}
            </div>
            <div role="group" aria-label="Zoom the sheet" className="absolute bottom-2 left-2 z-10 flex items-center overflow-hidden rounded-md border bg-background/90 text-xs leading-none shadow-xs">
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.4)} className="px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">−</button>
              <span className="min-w-10 border-x px-1.5 py-1.5 text-center tabular-nums text-muted-foreground" aria-live="polite">{Math.round((base.w / (zoomed ?? base).w) * 100)}%</span>
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.4)} className="px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">+</button>
              <button type="button" aria-label="Fit the whole sheet" title="Fit the whole sheet" disabled={zoomed === null} onClick={() => setZoomed(null)} className="border-l px-2 py-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40">Fit</button>
            </div>
            <HelpTip label="About the colours and numbers">
              Colours show how deep a panel is from the base. Numbers on the fold lines are the fold steps. <span className="text-teal-700 dark:text-teal-300">Green</span> folds inward, <span className="text-orange-600">orange</span> outward.
            </HelpTip>
            <svg ref={sheetSvg} viewBox={`${(zoomed ?? base).x} ${(zoomed ?? base).y} ${(zoomed ?? base).w} ${(zoomed ?? base).h}`} style={{ touchAction: "none" }} className={`max-h-[60vh] w-full select-none ${tool === "split" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`} role="img" aria-label="Flat sheet: panels in colour, fold lines numbered by fold step. Scroll to zoom, drag with any mouse button to move." onPointerDown={startPan} onContextMenu={(e) => e.preventDefault()} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }} onClick={onSheetClick} onPointerMove={tool === "split" && cutFrom ? (e) => setCutTo(toSheet(e)) : undefined}>
              {fold.panels.map((p) => {
                const d = depth.get(p.id) ?? 0;
                const on = sel?.kind === "panel" && sel.id === p.id;
                const hot = (blinkMode && hoverId === p.id && !on) || (hover3d === p.id && !on);
                const litSort = sortPanel === p.id;
                const litMerge = mergePair?.parentId === p.id || mergePair?.childId === p.id;
                const lit3d = (hover3d === p.id || litSort || litMerge) && !on;
                const [cx, cy] = centroid(p.polygon);
                // Names are 1.5x the old size (half of the earlier 3x, which was too big), never wider than their panel: a narrow panel turns its name or shrinks it.
                const xs = p.polygon.filter((_, i) => i % 2 === 0);
                const ys = p.polygon.filter((_, i) => i % 2 === 1);
                const pw = Math.max(...xs) - Math.min(...xs);
                const ph = Math.max(...ys) - Math.min(...ys);
                const nameLen = Math.max(1, p.label.length) * 0.56;
                const fsMax = (size / 40) * 1.5;
                const flatFs = Math.min(fsMax, (pw * 0.92) / nameLen, ph * 0.5);
                const turnedFs = Math.min(fsMax, (ph * 0.92) / nameLen, pw * 0.8);
                const turn = turnedFs > flatFs * 1.15;
                const nameFs = (turn ? turnedFs : flatFs) * (labelSize === "sm" ? 0.6 : 1);
                return (
                  <g key={p.id}>
                    <path
                      d={pathData(p.polygon, true)}
                      fill={DEPTH_COLORS[d % DEPTH_COLORS.length]}
                      fillOpacity={on || lit3d ? 0.95 : 0.6}
                      stroke={on || hot ? "#2563eb" : "#ffffff"}
                      strokeWidth={size / (on || lit3d ? 120 : hot ? 220 : 400)}
                      className={hover3d === p.id || litSort ? "cursor-pointer animate-pulse" : "cursor-pointer"}
                      onPointerEnter={() => setHoverId(p.id)}
                      onPointerLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
                      onClick={(e) => {
                        if (tool === "split") return; // the click goes on to the sheet: it is a point of the cut
                        e.stopPropagation();
                        if (tool === "merge") return;
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
                // The step number badge: small, and a little smaller still when the sheet is zoomed in.
                const dot = size / 120 / Math.sqrt(Math.max(1, base.w / (zoomed ?? base).w));
                const at = queue.findIndex((x) => x.id === h.id);
                const lit = sortHinge?.id === h.id;
                const on = lit || mergePair?.id === h.id || (quick ? at >= 0 : sel?.kind === "hinge" && sel.id === h.id);
                const [x1, y1, x2, y2] = h.line;
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <g key={h.id} className="cursor-pointer" onPointerEnter={() => tool === "merge" && setMergeHover(h.id)} onPointerLeave={() => tool === "merge" && setMergeHover((cur) => (cur === h.id ? null : cur))} onClick={(e) => { if (tool === "split") return; e.stopPropagation(); if (tool === "merge") applyEdit(mergePanels(fold, h.id), "Panels joined."); else if (quick) toggleQueued(h.id); else setSel({ kind: "hinge", id: h.id }); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={size / 40} />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={h.angleDeg < 0 ? "#ea580c" : "#0f766e"} strokeWidth={size / (on ? 90 : 170)} strokeLinecap="round" />
                    <circle cx={mx} cy={my} r={dot * (quick && at >= 0 ? 1.25 : 1)} fill={on ? "#18181b" : quick ? "#71717a" : "#18181b"} />
                    <text x={mx} y={my + dot * 0.38} textAnchor="middle" fontSize={dot * 1.05} fill="#ffffff" pointerEvents="none">{quick ? (at >= 0 ? queue[at]!.step : "") : h.order}</text>
                  </g>
                );
              })}
              {cutFrom ? (
                <g pointerEvents="none">
                  {chord ? <line x1={chord.p[0]} y1={chord.p[1]} x2={chord.q[0]} y2={chord.q[1]} stroke="#2563eb" strokeWidth={size / 200} strokeDasharray={`${size / 90} ${size / 180}`} /> : null}
                  <circle cx={cutFrom[0]} cy={cutFrom[1]} r={size / 120} fill="#2563eb" />
                </g>
              ) : null}
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            {fold.panels.length} panels, {fold.hinges.length} fold lines, {steps.length} {steps.length === 1 ? "step" : "steps"}{parts.length ? `, ${parts.length + 1} pieces` : ""}.
          </p>
          {SHOW_GROUND_PICKER ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <label htmlFor="ground-panel" className="font-medium">Bottom (on the ground)</label>
              <InfoTip label="Bottom (on the ground)">The panel chosen here lies flat on the floor with its printed side down, like the bottom of a box. Pick the panel that is the base, and the box stands up on it.</InfoTip>
              <select id="ground-panel" className={`${field} min-w-0 flex-1 basis-40`} value={fold.groundId ?? ""} onChange={(e) => onChange(setGround(fold, e.target.value || null))}>
                <option value="">Automatic</option>
                {fold.panels.map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        {/* Divider: drag it left or right to give the sheet or the 3D view more room (double click: 50 / 50). Side by side from xl up. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize the sheet and the 3D view (double click to reset)"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={Math.round(splitPct)}
          tabIndex={0}
          title="Drag to resize (double click: 40/60)"
          className="group relative z-10 hidden w-0 shrink-0 cursor-col-resize touch-none outline-none xl:block"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            splitDrag.current = e.pointerId;
            e.preventDefault();
          }}
          onPointerMove={(e) => {
            if (splitDrag.current !== e.pointerId) return;
            const r = splitBox.current?.getBoundingClientRect();
            if (r && r.width > 0) setSplitPct(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)));
          }}
          onPointerUp={() => (splitDrag.current = null)}
          onPointerCancel={() => (splitDrag.current = null)}
          onDoubleClick={() => setSplitPct(40)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            if (e.key === "ArrowLeft") setSplitPct((v) => Math.max(25, v - step));
            else if (e.key === "ArrowRight") setSplitPct((v) => Math.min(75, v + step));
            else if (e.key === "Home") setSplitPct(40);
            else return;
            e.preventDefault();
          }}
        >
          <span aria-hidden className="absolute inset-y-0 -left-2 w-4" />
          <span aria-hidden className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-border transition-shadow duration-150 group-hover:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-active:shadow-[0_0_4px_1px_rgba(59,130,246,0.5)]" />
          <span aria-hidden className="absolute top-1/2 left-0 flex h-12 w-3 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border bg-background shadow-sm transition-shadow duration-150 group-hover:shadow-[0_0_4px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_4px_rgba(59,130,246,0.35)] group-active:shadow-[0_0_5px_1px_rgba(59,130,246,0.5)]">
            <span className="size-[3px] rounded-full bg-muted-foreground/70" />
            <span className="size-[3px] rounded-full bg-muted-foreground/70" />
            <span className="size-[3px] rounded-full bg-muted-foreground/70" />
          </span>
        </div>

        {/* 3D preview */}
        <div className="flex min-w-0 flex-col gap-2 xl:min-w-0 xl:flex-1 xl:basis-0 xl:pl-2">
          <div className="relative overflow-hidden rounded-xl border bg-muted/40">
            {geo.geo ? (
              <CartonView ref={view} className="h-[min(420px,50vh)] w-full" geo={shownGeo ?? geo.geo} texture={null} textureRect={null} progress={progress} outsideColor={boardColor} insideColor={boardLook.inside} thickness={boardThickness} boardGrain={boardLook.grain} boardEdge={{ color: boardLook.edge, flute: boardLook.flute }} initialView={startView} onPanelHover={setHover3d} onPanelClick={onPanel3dClick} onUserView={() => { turnedFrom.current = null; }} onReady={onViewReady} />
            ) : (
              <p className="grid h-48 place-items-center px-4 text-center text-sm text-muted-foreground">{geo.error ?? "Fix the problems above to see the 3D preview."}</p>
            )}
            <div className="flex items-center gap-2 border-t bg-background px-3 py-2 text-xs">
              <label className="flex flex-1 items-center gap-2">
                Open
                <RangeSlider min={0} max={100} value={Math.round(progress * 100)} className="flex-1" aria-label="Fold amount: open to closed" onChange={(e) => setProgress(Number(e.target.value) / 100)} />
                Closed
              </label>
              <button type="button" aria-label="Play the fold step by step" className="grid size-7 place-items-center rounded-md border hover:bg-muted" onClick={play}><Play className="size-3.5" /></button>
              <button type="button" aria-label="Reset camera" className="grid size-7 place-items-center rounded-md border hover:bg-muted" onClick={() => view.current?.resetView()}><RotateCcw className="size-3.5" /></button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap select-none">
                <input type="checkbox" className="size-3.5 accent-primary" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                Show labels on 3D view
              </label>
            </div>
            {geo.geo ? <><GridToggle viewRef={view} keepViewByDefault /><RotationControls viewRef={view} /></> : null}
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
            <Button type="button" variant="dark" size="sm" aria-pressed={fold.groundId === shownPanel.id} onClick={() => onChange(setGround(fold, fold.groundId === shownPanel.id ? null : shownPanel.id))} title="In the 3D view the box stands on this panel, with its printed side down.">{fold.groundId === shownPanel.id ? "Bottom of the 3D View ✓ (click to undo)" : "Set as bottom of the 3D View"}</Button>
            <Button type="button" variant="dark" size="sm" disabled={roots.includes(shownPanel.id)} onClick={() => onChange(makeBase(fold, shownPanel.id))}>
              {roots.includes(shownPanel.id) ? "Already made as base ✓" : parts.length ? `Make this the base of its piece (${pieceName(roots[Math.max(0, pieceOf(fold, shownPanel.id))]!).toLowerCase()})` : "Make this the base (stays flat)"}
            </Button>
          </div>
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <Button type="submit" variant="dark">Done</Button>
            </div>
          </form>
        ) : null}
      </dialog>
      {editHinge && fold.hinges.some((h) => h.id === editHinge) ? (() => {
        const h = fold.hinges.find((x) => x.id === editHinge)!;
        return (
          <FoldRowPanel
            hinge={h}
            name={label(h.childId)}
            parentName={label(h.parentId)}
            kinds={ROLE_OPTIONS}
            kind={fold.panels.find((p) => p.id === h.childId)?.role ?? "body"}
            onClose={() => setEditHinge(null)}
            onChange={(v) => {
              // Each change applies to this row only: its step and angle, and the kind of the panel it swings.
              let next = fold;
              if (v.order !== undefined || v.angleDeg !== undefined) next = updateHinge(next, h.id, { ...(v.order !== undefined ? { order: v.order } : {}), ...(v.angleDeg !== undefined ? { angleDeg: v.angleDeg } : {}) });
              if (v.kind !== undefined) next = updatePanel(next, h.childId, { role: v.kind as PanelRole });
              onChange(next);
              // The chip follows its new step.
              const step = v.order;
              if (step !== undefined) setQueue((q) => (q.some((x) => x.id === h.id) ? q.map((x) => (x.id === h.id ? { ...x, step } : x)).sort((a, b) => a.step - b.step) : q));
            }}
          />
        );
      })() : null}
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
            stale ? <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Detect the panels again first: the lines changed after the fold was set up.</p> : <ConstructionEditor fold={fold} onChange={onChange} onMaterial={setPickedMaterial} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {pieceCount > 1 ? `${stepsOf(fold, curTab.i).length} ${stepsOf(fold, curTab.i).length === 1 ? "step" : "steps"}` : "Steps"}
                  <InfoTip label="Steps">
                    {pieceCount > 1 ? `${pieceName(roots[curTab.i]!)} has its own steps. ` : ""}Lines with the same step number fold together. Drag a row by its handle (or focus it and press the up / down arrow keys) to change which fold happens first. Type a step number to fold several lines together: give them the same number.
                  </InfoTip>
                </p>
                <div className="flex items-center gap-2">
                  {sortedHinges(fold, curTab.i).length ? <Button type="button" variant="dark" size="xs" disabled={stale} aria-pressed={quick} title="Open Quick sort with the lines already grouped in their steps" onClick={sortAgain}><ListOrdered className="size-3.5" aria-hidden /> Sort again</Button> : null}
                  {curTab.i > 0 ? <Button type="button" variant="dark" size="xs" onClick={() => onChange(makeMain(fold, roots[curTab.i]!))}>Make main body</Button> : null}
                </div>
              </div>
              {sortedHinges(fold, curTab.i).length ? (
                <StepNumberTool
                  steps={stepsOf(fold, curTab.i).map((step) => {
                    const lines = sortedHinges(fold, curTab.i).filter((h) => h.order === step);
                    const first = Math.abs(lines[0]!.angleDeg);
                    return { step, count: lines.length, angle: lines.every((h) => Math.abs(h.angleDeg) === first) ? first : null };
                  })}
                  onApply={(step, toStep) => onChange(setStepNumber(fold, curTab.i, step, toStep))}
                />
              ) : null}
              {sortedHinges(fold, curTab.i).length ? (
                <HingeList hinges={sortedHinges(fold, curTab.i)} label={label} selectedId={quick ? picked : sel?.kind === "hinge" ? sel.id : null} onSelect={(id) => setSel({ kind: "hinge", id })} onSetHinge={setHinge} onMove={(id, to) => onChange(moveHinge(fold, id, to))} kinds={ROLE_OPTIONS} kindOf={(id) => fold.panels.find((p) => p.id === id)?.role ?? "body"} onKind={(id, role) => onChange(updatePanel(fold, id, { role: role as PanelRole }))} />
              ) : (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">This piece has no fold lines.</p>
              )}
            </>
          )}
        </div>
      </div>
      {quick ? (
        <QuickSortBar
          bottom="0px"
          closing={quickClosing}
          items={liveQueue.map((it) => ({ id: it.id, label: hingeName(it.id), step: it.step }))}
          step={quickStep}
          total={fold.hinges.length}
          count={stepsShown}
          onSelectStep={setQuickStep}
          onEdit={setEditHinge}
          onHover={setSortHover}
          partNames={sortingParts}
          activeId={editHinge}
          preview={previewSort}
          onPreviewChange={setPreviewSort}
          onAddStep={() => { setQuickCount(stepsShown + 1); setQuickStep(stepsShown + 1); }}
          onSetStep={setQueuedStep}
          onRemoveStep={removeQueuedStep}
          onRemove={(id) => setQueue((q) => q.filter((x) => x.id !== id))}
          onClear={() => { setQueue([]); setQuickStep(1); setQuickCount(1); }}
          onCancel={closeQuick}
          onApply={() => { onChange(applyFoldSteps(fold, liveQueue)); closeQuick(); }}
        />
      ) : null}
      {onWindows && geo.geo ? (
        <WindowEditorModal
          open={windowsOpen}
          geo={geo.geo}
          value={windows}
          unit={windowUnit}
          onUnit={setWindowUnit}
          onCancel={() => setWindowsOpen(false)}
          onDone={(next) => {
            onWindows(next);
            setWindowsOpen(false);
          }}
          thickness={geo.thickness ?? 0}
        />
      ) : null}
    </div>
  );
}
