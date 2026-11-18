"use client";

import { isBackgroundCategory } from "@/lib/artwork-meta";
import { notify } from "@/lib/notify";
import "./fonts";
import Link from "next/link";
import { site } from "@/config/site";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Circle,
  PaintBucket,
  Copy,
  Download,
  Hand,
  Group,
  Ungroup,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Check,
  ImagePlus,
  Maximize,
  Move,
  Minus,
  Plus,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  SlidersHorizontal,
} from "lucide-react";
import { applyWindows, createImportedGenerator, generateDieline, type FlatDieline, type FoldSetup, type WatermarkSpec, type WindowSpec } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import type { ViewSettings } from "@/lib/view-settings";
import { type Artwork, type ArtworkObject, type BoxBackground, MAX_BACKGROUNDS, backgroundsOf, facesOf } from "@packaging/schema";
import { saveArtwork, saveThreeD } from "@/app/editor/[id]/actions";
import { Preview3D, type ThreeDSettings } from "@/components/viewer3d/preview-3d";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { EditorController, type OverlayOptions, type Viewport } from "./editor-controller";
import { AutoSaver, type SaveState } from "@/lib/autosave";
import { ExportDialog } from "./export-dialog";
import { LayerList } from "./layer-list";
import { UserMenuClient } from "@/components/app/user-menu-client";
import { EditorSkeletonOverlay } from "./editor-skeleton";
import { ArtworkPicker, canDrop, readDragged, type Dragged, type PickerLibraryItem } from "./artwork-picker";
import { PropertiesPanel } from "./properties-panel";
import { RULER_SIZE, Ruler } from "./rulers";

type Asset = { id: string; fileName: string };

/** CSS pixels per millimetre (96 px per inch). */
const PX_PER_MM_AT_100 = 96 / 25.4;

/** Editor columns (px): the side panels are fixed; the dieline and the 3D view share the rest and can be resized. */
const LEFT_W = 240;
/** The Artwork section of the left panel: its share of the height, and the least and most the divider allows. */
const SPLIT_DEFAULT = 70;
const SPLIT_MIN = 25;
const SPLIT_MAX = 85;
const RIGHT_W = 288;
const MIN_3D = 240;
const MIN_CANVAS = 320;
/** How long the 3D preview takes to slide in or out (ms). */
const THREE_MS = 360;


function ToolButton({ label, onClick, disabled, children, active }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-xs hover:bg-muted disabled:opacity-40 ${active ? "bg-muted" : ""}`}
    >
      {children}
    </button>
  );
}

/** Current width of the 3D panel that holds `el` (the divider), for keyboard resizing from the default width. */
const sectionWidth = (el: HTMLElement) => el.parentElement?.clientWidth ?? 400;

const OVERLAY_TOGGLES = [
  { key: "showGrid", label: "Grid" },
  { key: "showBleed", label: "Bleed" },
  { key: "showSafe", label: "Safe area" },
  { key: "showDimensions", label: "Dimensions" },
] as const;

/** Colours offered for a face: plain board-like colours first, then strong ones. */
const FACE_COLORS = ["#ffffff", "#f3e6d3", "#f4c95d", "#fbd5e3", "#e86a6a", "#8c1d1d", "#8a5a2b", "#0f6b1d", "#3b82f6", "#9ca3af", "#111111"] as const;

/**
 * The box that opens on a panel in Face color mode: pick a colour for that whole panel, or take it away.
 * Colours are applied at once (one undo step each); the custom colour is applied when its picker closes.
 */
function FaceColorBox({ name, color, left, top, onPick, onClose }: { name: string; color: string | null; left: number; top: number; onPick: (c: string | null) => void; onClose: () => void }) {
  const custom = useRef<HTMLInputElement>(null);
  // The browser's colour picker fires "input" all the time and "change" when it is closed: only the last counts as one step.
  useEffect(() => {
    const el = custom.current;
    if (!el) return;
    const done = () => onPick(el.value);
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  });
  return (
    <div
      role="dialog"
      aria-label={`Face color of ${name}`}
      className="absolute z-30 w-64 rounded-xl border bg-background p-3 shadow-lg"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Face color</p>
          <p className="truncate text-xs text-muted-foreground">{name}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">×</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title="No face color"
          aria-label="No face color"
          aria-pressed={color === null}
          onClick={() => onPick(null)}
          className={`relative grid size-7 place-items-center overflow-hidden rounded-full border bg-white ${color === null ? "ring-2 ring-foreground ring-offset-1" : ""}`}
        >
          <span aria-hidden className="absolute h-px w-9 rotate-45 bg-red-500" />
        </button>
        {FACE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Face color ${c}`}
            aria-pressed={color?.toLowerCase() === c}
            onClick={() => onPick(c)}
            className={`size-7 rounded-full border ${color?.toLowerCase() === c ? "ring-2 ring-foreground ring-offset-1" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label title="Pick any color" className="relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border" style={{ background: "conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}>
          <span className="sr-only">Pick any color</span>
          <input ref={custom} type="color" defaultValue={color ?? "#ffffff"} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Click another panel to colour it too. Press Esc to close.</p>
    </div>
  );
}

/** Bottom bar over the dieline: hand and face color tools, zoom (minus, plus, percentage, fit) and what to show on the sheet (grid, bleed, safe area). */
function CanvasBar({
  viewport,
  overlay,
  onOverlay,
  onBy,
  onFit,
  panMode,
  onPan,
  faceTool,
  onFace,
}: {
  viewport: Viewport | null;
  overlay: OverlayOptions;
  onOverlay: (o: OverlayOptions) => void;
  onBy: (f: number) => void;
  onFit: () => void;
  panMode: boolean;
  onPan: () => void;
  faceTool: boolean;
  onFace: () => void;
}) {
  const z = viewport?.zoom ?? 1;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [menuOpen]);
  return (
    <div className="absolute inset-x-2 bottom-3 z-10 mx-auto flex w-fit flex-wrap items-center justify-center gap-x-0.5 gap-y-0.5 rounded-lg border bg-background/95 px-1.5 py-1 shadow-md backdrop-blur" role="toolbar" aria-label="Dieline view">
      <ToolButton label="Hand tool: drag to move the view (or hold Space, or drag with the right mouse button)" active={panMode} onClick={onPan}><Hand className="size-4" /></ToolButton>
      <ToolButton label="Face color: click a panel of the dieline to give it a color" active={faceTool} onClick={onFace}><PaintBucket className="size-4" /></ToolButton>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <ToolButton label="Zoom out (Ctrl/Cmd+-)" onClick={() => onBy(0.8)}><Minus className="size-4" /></ToolButton>
      <span className="w-10 text-center text-xs tabular-nums" title="100% = real size on a 96 dpi screen. Mouse wheel zooms, Shift + wheel moves sideways.">{viewport ? `${Math.round((z / PX_PER_MM_AT_100) * 100)}%` : ""}</span>
      <ToolButton label="Zoom in (Ctrl/Cmd++)" onClick={() => onBy(1.25)}><Plus className="size-4" /></ToolButton>
      <ToolButton label="Fit to screen (Ctrl/Cmd+0)" onClick={onFit}><Maximize className="size-4" /></ToolButton>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <div ref={menuRef} className="relative">
        <button
          type="button"
          title="View options"
          aria-label="View options"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className={`flex h-8 min-w-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${menuOpen ? "bg-muted" : ""}`}
        >
          <SlidersHorizontal className="size-4" />
        </button>
        {menuOpen ? (
          <div role="group" aria-label="View options" className="absolute bottom-full left-1/2 z-20 mb-3 flex w-36 -translate-x-1/2 flex-col rounded-xl border bg-background p-1 shadow-lg">
            {OVERLAY_TOGGLES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={overlay[key]}
                onClick={() => onOverlay({ ...overlay, [key]: !overlay[key] })}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${overlay[key] ? "bg-primary" : "bg-muted-foreground/30"}`} aria-hidden>
                  <span className={`absolute top-0.5 size-3 rounded-full bg-background shadow transition-[left] ${overlay[key] ? "left-[0.8125rem]" : "left-0.5"}`} />
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ArtworkEditor({
  projectId,
  name,
  generatorId,
  imported,
  initialView = null,
  params,
  windows = [],
  artwork: initialArtwork,
  assets: initialAssets,
  library = [],
  favoriteIds = [],
  threeD: initialThreeD,
  watermark = null,
  viewer = null,
}: {
  projectId: string;
  name: string;
  generatorId: string;
  /** Imported (SVG) template: its lines, to rebuild the dieline here. */
  imported?: { templateId: string; flat: FlatDielineData; fold?: FoldSetup | null };
  /** Camera the 3D preview starts with (set per template by an admin). */
  initialView?: ViewSettings | null;
  params: Record<string, unknown>;
  /** Window holes cut into the box (made in the dieline page's window editor). */
  windows?: readonly WindowSpec[];
  artwork: Artwork;
  assets: Asset[];
  /** Pictures the admin keeps for everyone (the "Library" tab). */
  library?: PickerLibraryItem[];
  /** Library pictures this customer starred, newest first (the "Favorites" tab). */
  favoriteIds?: string[];
  /** The signed-in user (their profile icon is shown at the right of the top bar). */
  viewer?: { name: string; email: string; image: string | null } | null;
  threeD: ThreeDSettings;
  /** Put into the PNG and 3D downloads (the server adds it to the other files); null = none. */
  watermark?: WatermarkSpec | null;
}) {
  // Keyed by value: a props refresh with equal params must not rebuild the editor (and lose undo history).
  const paramsKey = JSON.stringify(params);
  // Background pictures have their own list in the Background panel; the Artwork Library tab shows the rest.
  const backgroundLibrary = useMemo(() => library.filter((l) => isBackgroundCategory(l.category)), [library]);
  const artworkLibrary = useMemo(() => library.filter((l) => !isBackgroundCategory(l.category)), [library]);
  const windowsKey = JSON.stringify(windows);
  const geo = useMemo(() => {
    try {
      const base = imported ? createImportedGenerator(imported.templateId, imported.flat as FlatDieline, imported.fold ?? null).generate(JSON.parse(paramsKey)) : generateDieline(generatorId, JSON.parse(paramsKey));
      return applyWindows(base, JSON.parse(windowsKey) as WindowSpec[]).geo;
    } catch {
      return null;
    }
  }, [generatorId, imported, paramsKey, windowsKey]);
  // Imported dielines are flat: nothing to fold, so no 3D.
  const foldable = (geo?.foldTree.hinges.length ?? 0) > 0;

  const canvasEl = useRef<HTMLCanvasElement>(null);
  const hostEl = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bgFileInput = useRef<HTMLInputElement>(null);
  const ctl = useRef<EditorController | null>(null);

  const [objects, setObjects] = useState<ArtworkObject[]>(initialArtwork.objects);
  const [backgrounds, setBackgrounds] = useState<BoxBackground[]>(() => backgroundsOf(initialArtwork));
  const [bgSelected, setBgSelected] = useState(-1);
  /** File names of the private copies made from library backgrounds (the layer list shows them). */
  const [libNames, setLibNames] = useState<Record<string, string>>({});
  const [bgEditing, setBgEditing] = useState(false);
  /** The editor is drawn: until then a skeleton of the page covers it. */
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedData, setSelectedData] = useState<ArtworkObject | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [overlay, setOverlay] = useState<OverlayOptions>({ showGrid: true, showBleed: true, showSafe: true, showDimensions: false });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [panMode, setPanMode] = useState(false);
  // Face color: the tool, the panel whose colour box is open (and where), and the colours as panel id -> colour.
  const [faceTool, setFaceTool] = useState(false);
  const [hostSize, setHostSize] = useState({ w: 800, h: 600 });
  const [facePick, setFacePick] = useState<{ panelId: string; x: number; y: number } | null>(null);
  const [faces, setFaces] = useState<Record<string, string>>(() => facesOf(initialArtwork));
  const [dropping, setDropping] = useState(false);
  /** Right-click menu of the selected artwork (px from the top-left of the dieline area), or null. */
  /** Width (px) of the 3D panel, set by dragging the divider; null = the default (38%). Remembered in this browser. */
  const [threeW, setThreeW] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem("editor.3dWidth"));
      return Number.isFinite(v) && v >= MIN_3D ? v : null;
    } catch {
      return null;
    }
  });
  const gridEl = useRef<HTMLDivElement>(null);
  /** Share (%) of the left panel height the Artwork section takes; the rest is the layer list. Set by dragging the divider, remembered in this browser. */
  const [splitPct, setSplitPct] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("editor.artworkHeight"));
      return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEFAULT;
    } catch {
      return SPLIT_DEFAULT;
    }
  });
  const leftEl = useRef<HTMLElement>(null);
  const clampSplit = (v: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v));
  /** Keep the height (and remember it in this browser). While dragging only the CSS variable moves, see `dragSplit`. */
  const saveSplit = (v: number) => {
    const next = Math.round(clampSplit(v) * 10) / 10;
    setSplitPct(next);
    try {
      if (next === SPLIT_DEFAULT) localStorage.removeItem("editor.artworkHeight");
      else localStorage.setItem("editor.artworkHeight", String(next));
    } catch {
      /* private mode: the height just is not remembered */
    }
  };
  /** A drag in progress: where inside the grip the pointer took hold, the frame waiting to draw, and the latest height. */
  const dragSplit = useRef<{ grab: number; frame: number | null; pct: number } | null>(null);
  const draggedW = useRef<number | null>(null);
  const saveThreeW = (w: number | null) => {
    setThreeW(w);
    try {
      if (w === null) localStorage.removeItem("editor.3dWidth");
      else localStorage.setItem("editor.3dWidth", String(Math.round(w)));
    } catch {
      /* private mode: the width just is not remembered */
    }
  };
  /** Largest 3D width that still leaves the dieline MIN_CANVAS wide (the side panels are fixed). */
  const maxThreeW = () => Math.max(MIN_3D, (gridEl.current?.clientWidth ?? 1200) - LEFT_W - RIGHT_W - MIN_CANVAS);
  const clampThreeW = (w: number) => Math.round(Math.min(maxThreeW(), Math.max(MIN_3D, w)));
  const [menu, setMenu] = useState<{ x: number; y: number; atTop: boolean; atBottom: boolean } | null>(null);
  /** What a choice in the background picture's right-click menu does. */
  const bgAction = (what: "edit" | "done" | "up" | "down" | "remove", index: number) => {
    const k = ctl.current;
    if (!k) return;
    if (what === "edit") k.setBackgroundEdit(true);
    else if (what === "done") k.setBackgroundEdit(false);
    else if (what === "up") k.moveBackground(index, 1);
    else if (what === "down") k.moveBackground(index, -1);
    else void k.removeBackground(index);
  };
  /** Right-click menu of a background picture: where, and which picture of the stack. */
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [show3d, setShow3d] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [threeD, setThreeD] = useState<ThreeDSettings>(initialThreeD);
  const view3d = useRef<CartonViewHandle>(null);
  // 3D on/off is animated: the 3D column grows or shrinks (drawer-like), the dieline follows and is re-fitted on every frame.
  // `expanded` drives the column width, `animating` switches the CSS transition on (never while dragging the divider),
  // `exited` keeps the preview mounted until the closing animation is over.
  const [expanded, setExpanded] = useState(show3d);
  const [animating, setAnimating] = useState(false);
  const [exited, setExited] = useState(!show3d);
  const [gridW, setGridW] = useState(1200);
  useEffect(() => {
    const el = gridEl.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setGridW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const seen3d = useRef(show3d);
  useEffect(() => {
    if (seen3d.current === show3d) return;
    seen3d.current = show3d;
    let start = -1;
    let frame = 0;
    let id2 = 0;
    let done = 0;
    let fit = 0;
    const follow = (now: number) => {
      if (start < 0) start = now;
      ctl.current?.zoomFit();
      if (now - start < THREE_MS + 40) frame = requestAnimationFrame(follow);
    };
    // Two frames so a freshly mounted preview is painted at width 0 before it grows.
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setExited(false);
        setAnimating(true);
        setExpanded(show3d);
        frame = requestAnimationFrame(follow);
        done = window.setTimeout(() => {
          setAnimating(false);
          if (!show3d) setExited(true);
        }, THREE_MS + 30);
        fit = window.setTimeout(() => ctl.current?.zoomFit(), THREE_MS + 80);
      });
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
      window.clearTimeout(fit);
    };
  }, [show3d]);
  /** Width (px) of the 3D column when it is open. */
  const openW = threeW ?? Math.max(280, Math.round(gridW * 0.38));
  const threeVisible = foldable && (show3d || !exited);
  const artworkForPreview = useMemo<Artwork>(() => {
    const list = Object.entries(faces).map(([panelId, color]) => ({ panelId, color }));
    return { objects, backgrounds, ...(list.length ? { faces: list } : {}) };
  }, [objects, backgrounds, faces]);
  const updateThreeD = (s: ThreeDSettings) => {
    setThreeD(s);
    void saveThreeD(projectId, s).then((r) => {
      if (!r.ok) notify.error(r.message, { id: "editor-save" });
    });
  };

  // ------------------------------------------------------------ saving
  const [saver] = useState(
    () =>
      new AutoSaver(
        (art) => saveArtwork(projectId, art),
        (state, error) => {
          setSaveState(state);
          if (error) notify.error(error, { id: "editor-save" });
          else if (state === "saved") notify.dismiss("editor-save"); // recovered after a failed save
        },
      ),
  );
  const saveNow = () => void saver.flush(ctl.current?.toArtwork());

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saver.unsaved) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      saver.dispose();
    };
  }, [saver]);

  // ------------------------------------------------------------ controller
  const refreshSelection = useCallback((ids: string[]) => {
    setSelected(ids);
    setSelectedData(ids.length === 1 ? (ctl.current?.getData(ids[0]!) ?? null) : null);
  }, []);

  useEffect(() => {
    if (!geo || !canvasEl.current || !hostEl.current) return;
    const c = new EditorController(canvasEl.current, geo, {
      onChange: (art) => {
        setObjects(art.objects);
        setBackgrounds(backgroundsOf(art));
        setFaces(facesOf(art));
        saver.schedule(art);
      },
      onSelection: (ids) => {
        setMenu(null);
        setBgMenu(null);
        refreshSelection(ids);
      },
      onViewport: (v) => {
        setMenu(null);
        setBgMenu(null);
        setViewport(v);
      },
      // Keep the menu (about 150 x 90 px) inside the dieline area.
      onContextMenu: (at) => setMenu({ ...c.stackState(), x: Math.max(0, Math.min(at.x, (hostEl.current?.clientWidth ?? 0) - 190)), y: Math.max(0, Math.min(at.y, (hostEl.current?.clientHeight ?? 0) - 270)) }),
      onBackgroundContextMenu: (at) => {
        setMenu(null);
        setBgMenu({ index: at.index, x: Math.max(0, Math.min(at.x, (hostEl.current?.clientWidth ?? 0) - 230)), y: Math.max(0, Math.min(at.y, (hostEl.current?.clientHeight ?? 0) - 170)) });
      },
      onHistory: setHistory,
      onError: (text) => notify.error(text),
      onBackgroundEdit: setBgEditing,
      onBackgroundSelect: setBgSelected,
      onFacePick: setFacePick,
    });
    ctl.current = c;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __editor: c });
    const host = hostEl.current;
    c.resize(host.clientWidth, host.clientHeight);
    let alive = true;
    // The page keeps its skeleton until the sheet, its pictures and the background are drawn.
    void c.init(initialArtwork).finally(() => alive && setLoaded(true));
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      c.resize(Math.floor(e.contentRect.width), Math.floor(e.contentRect.height));
      setHostSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(host);
    return () => {
      alive = false;
      ro.disconnect();
      c.dispose();
      ctl.current = null;
    };
    // initialArtwork is only the starting state.
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => ctl.current?.setOverlay(overlay), [overlay]);

  // The right-click menus close on any press outside them, and on Escape.
  useEffect(() => {
    if (!menu && !bgMenu) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[role=menu]")) {
        setMenu(null);
        setBgMenu(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(null);
      setBgMenu(null);
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menu, bgMenu]);

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      const c = ctl.current;
      if (!c || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        c.spaceDown = true;
        hostEl.current?.style.setProperty("cursor", "grab");
        e.preventDefault();
      } else if ((e.key === "Escape" || e.key === "Enter") && c.isBackgroundEditing()) {
        // Enter must not also press a focused "Done" button (that would turn the editing on again).
        if (e.key === "Enter") e.preventDefault();
        c.setBackgroundEdit(false);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void (e.shiftKey ? c.redo() : c.undo());
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void c.redo();
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) c.ungroup();
        else c.group();
      } else if (mod && (e.key === "]" || e.key === "}")) {
        e.preventDefault();
        c.arrange(e.shiftKey ? "front" : "forward");
      } else if (mod && (e.key === "[" || e.key === "{")) {
        e.preventDefault();
        c.arrange(e.shiftKey ? "back" : "backward");
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void c.duplicateSelected();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        c.zoomFit();
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        c.zoomBy(1.25);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        c.zoomBy(0.8);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        c.removeSelected();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key] ?? [0, 0];
        c.nudge(dx!, dy!);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && ctl.current) {
        ctl.current.spaceDown = false;
        hostEl.current?.style.removeProperty("cursor");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ uploads and placing
  /** Upload one picture; it joins "Uploads". Returns the new asset, or null (the reason is shown). */
  const uploadOne = async (file: File): Promise<Asset | null> => {
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("projectId", projectId);
      const res = await fetch("/api/assets", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
      if (!res.ok || !json.asset) throw new Error(json.error ?? `Upload failed (${res.status}).`);
      setAssets((a) => [json.asset!, ...a]);
      return json.asset;
    } catch (e) {
      notify.error(`${file.name}: ${(e as Error).message}`);
      return null;
    }
  };

  /** Delete one of the user's own uploads for good. Not while it is on this box; the server also refuses while any other project uses it. */
  const deleteAsset = async (id: string, name: string) => {
    if (objects.some((o) => o.type === "image" && o.assetId === id) || backgrounds.some((b) => b.assetId === id)) {
      notify.error(`"${name}" is used on this box. Remove it from the box first.`);
      return;
    }
    if (!window.confirm(`Delete "${name}"? The picture is removed from your uploads and cannot be brought back.`)) return;
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Delete failed (${res.status}).`);
      setAssets((a) => a.filter((x) => x.id !== id));
      notify.success("Picture deleted.");
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  /** Upload pictures one after another. `place`: also put each on the dieline (at `at`, shifted a little for each one). */
  const uploadMany = async (files: File[], opts: { place?: boolean; at?: { x: number; y: number } } = {}) => {
    const ok = files.filter((f) => /^image\/(png|jpeg)$/.test(f.type));
    if (ok.length < files.length) notify.error(`${files.length - ok.length} file${files.length - ok.length > 1 ? "s were" : " was"} skipped: only PNG or JPEG can be added.`);
    if (ok.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const [i, f] of ok.entries()) {
      const a = await uploadOne(f);
      if (!a) continue;
      added++;
      if (opts.place) await ctl.current?.addImage(a.id, a.fileName, opts.at ? { x: opts.at.x + i * 24, y: opts.at.y + i * 24 } : undefined);
    }
    setUploading(false);
    if (added > 1 || (added === 1 && !opts.place)) notify.success(added === 1 ? "Picture added to Uploads." : `${added} pictures added to Uploads.`);
  };

  const uploadBackground = async (file: File) => {
    setUploading(true);
    const a = await uploadOne(file);
    setUploading(false);
    if (a) await addBackground(a.id);
  };

  /** Put a picture on the dieline: an upload directly, a library picture after its private copy is made. */
  const place = async (d: Dragged, at?: { x: number; y: number }) => {
    try {
      if (d.kind === "asset") return void (await ctl.current?.addImage(d.id, d.name, at));
      const res = await fetch("/api/assets/from-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artworkId: d.id, projectId }) });
      const json = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
      if (!res.ok || !json.asset) throw new Error(json.error ?? `Could not use this picture (${res.status}).`);
      await ctl.current?.addImage(json.asset.id, d.name, at);
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  /** Put a picture on top of the background stack. The first one fills the box; later ones start smaller (fit inside, 60 %) so the ones below still show. */
  const addBackground = async (assetId: string) => {
    const first = backgrounds.length === 0;
    await ctl.current?.addBackground({ assetId, fit: first ? "cover" : "contain", scale: first ? 1 : 0.6, dx: 0, dy: 0, opacity: 1 });
  };

  /** A ready-made background picture: its private copy is made first, like for any library picture, then it joins the stack. */
  const pickLibraryBackground = async (pictureId: string) => {
    try {
      const res = await fetch("/api/assets/from-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artworkId: pictureId, projectId }) });
      const json = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
      if (!res.ok || !json.asset) throw new Error(json.error ?? `Could not use this picture (${res.status}).`);
      const copy = json.asset;
      setLibNames((n) => ({ ...n, [copy.id]: copy.fileName }));
      await addBackground(copy.id);
    } catch (e) {
      notify.error((e as Error).message);
    }
  };

  const dropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const d = readDragged(e.dataTransfer);
    if (d) return void place(d, at);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadMany(files, { place: true, at });
  };

  const togglePan = () => {
    const next = !panMode;
    setPanMode(next);
    ctl.current?.setPanMode(next);
    if (next && faceTool) toggleFace();
  };
  const toggleFace = () => {
    const next = !faceTool;
    setFaceTool(next);
    if (next && panMode) {
      setPanMode(false);
      ctl.current?.setPanMode(false);
    }
    ctl.current?.setFaceMode(next);
  };

  if (!geo) {
    return <p className="p-8 text-destructive">This project&apos;s box parameters no longer produce a valid dieline. Open the project settings and fix them first.</p>;
  }

  const c = ctl.current;
  const layers = [...objects].reverse(); // top first
  // Grouping, from the saved data of the chosen objects: groupable when they are not already exactly one group.
  const chosen = objects.filter((o) => selected.includes(o.id));
  const canGroup = chosen.length > 1 && new Set(chosen.map((o) => o.groupId ?? `single:${o.id}`)).size > 1;
  const canUngroup = chosen.some((o) => o.groupId);
  // Nothing is said when all is saved; only unsaved, saving and failed states show a note.
  const saveLabel = { saved: "", dirty: "Unsaved changes", saving: "Saving…", error: "Not saved" }[saveState];

  return (
    <div className="grid h-screen grid-rows-[48px_1fr] overflow-hidden bg-background">
      <EditorSkeletonOverlay show={!loaded} />
      {/* Top bar */}
      <header className="flex items-center gap-1 border-b px-2">
        <Link href="/" aria-label={`${site.name} home`} className="mr-1 grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
        </Link>
        <Link href={`/projects/${projectId}`} title={`Back to the dieline page of ${name}`} className="mr-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
          ← <span className="font-medium">Back to dieline page</span>
        </Link>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Add text" onClick={() => void c?.add("text")}><Type className="size-4" /></ToolButton>
        <ToolButton label="Add rectangle" onClick={() => void c?.add("rect")}><Square className="size-4" /></ToolButton>
        <ToolButton label="Add ellipse" onClick={() => void c?.add("ellipse")}><Circle className="size-4" /></ToolButton>
        <ToolButton label="Add line" onClick={() => void c?.add("line")}><Slash className="size-4" /></ToolButton>
        <ToolButton label="Upload pictures (PNG or JPEG, max 10 MB each)" disabled={uploading} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" />
          {uploading ? <span>Uploading…</span> : null}
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = Array.from(e.target.files ?? []);
            e.target.value = "";
            // One picture goes straight onto the dieline; several are added to Uploads to be dragged from there.
            if (f.length) void uploadMany(f, { place: f.length === 1 });
          }}
        />
        <input
          ref={bgFileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadBackground(f);
          }}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Undo (Ctrl/Cmd+Z)" disabled={!history.canUndo} onClick={() => void c?.undo()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="Redo (Shift+Ctrl/Cmd+Z)" disabled={!history.canRedo} onClick={() => void c?.redo()}><Redo2 className="size-4" /></ToolButton>
        <ToolButton label="Duplicate (Ctrl/Cmd+D)" disabled={!selected.length} onClick={() => void c?.duplicateSelected()}><Copy className="size-4" /></ToolButton>
        <ToolButton label="Delete (Del)" disabled={!selected.length} onClick={() => c?.removeSelected()}><Trash2 className="size-4" /></ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        {foldable ? (
          <ToolButton label={show3d ? "Hide 3D preview" : "Show 3D preview"} active={show3d} onClick={() => setShow3d((v) => !v)}>
            <Box className="size-4" /> 3D
          </ToolButton>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setShowExport(true)} className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted">
            <Download className="size-3.5" /> Export
          </button>
          {/* Empty when all is saved: then it is out of the row (sr-only), so Export, Save and the profile icon keep the same gaps. */}
          <span className={saveLabel ? `text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}` : "sr-only"} aria-live="polite">{saveLabel}</span>
          <button type="button" onClick={saveNow} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80">Save</button>
          {viewer ? <UserMenuClient name={viewer.name} email={viewer.email} image={viewer.image} /> : null}
        </div>
      </header>

      <div
        ref={gridEl}
        className="grid min-h-0"
        style={{
          gridTemplateColumns: threeVisible ? `${LEFT_W}px minmax(0,1fr) ${expanded && show3d ? openW : 0}px ${RIGHT_W}px` : `${LEFT_W}px minmax(0,1fr) ${RIGHT_W}px`,
          transition: animating ? `grid-template-columns ${THREE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : undefined,
        }}
      >
        {/* Left: layers + uploads */}
        <aside ref={leftEl} className="flex min-h-0 flex-col border-r" style={{ "--artwork-h": `${splitPct}%` } as React.CSSProperties}>
          <h2 className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layers</h2>
          <LayerList
            layers={layers}
            selected={selected}
            onSelect={(id) => c?.select([id])}
            onVisible={(id, visible) => void c?.update(id, { visible })}
            onLock={(id, locked) => c?.setLocked(id, locked)}
            onStep={(id, delta) => c?.reorder(id, delta)}
            onMoveTo={(id, index) => c?.moveTo(id, index)}
            onRename={(id, name) => c?.rename(id, name)}
          />
          {/* Drag this edge to give the layers or the artwork list more room (arrow keys too; double-click resets). */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the layers and the artwork list"
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            aria-valuenow={splitPct}
            tabIndex={0}
            className="group relative z-10 h-0 shrink-0 outline-none"
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              saveSplit(splitPct + (e.key === "ArrowUp" ? 3 : -3));
            }}
          >
            <div
              className="absolute inset-x-0 -top-1.5 h-3 cursor-row-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const r = e.currentTarget.getBoundingClientRect();
                dragSplit.current = { grab: r.top + r.height / 2 - e.clientY, frame: null, pct: splitPct };
              }}
              onPointerMove={(e) => {
                const d = dragSplit.current;
                const box = leftEl.current?.getBoundingClientRect();
                if (!d || !box || box.height <= 0 || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                // Smooth: no rounding and no React render while dragging; the height is a CSS variable set once per frame.
                d.pct = clampSplit(((box.bottom - (e.clientY + d.grab)) / box.height) * 100);
                if (d.frame === null) {
                  d.frame = requestAnimationFrame(() => {
                    d.frame = null;
                    leftEl.current?.style.setProperty("--artwork-h", `${d.pct}%`);
                  });
                }
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                const d = dragSplit.current;
                dragSplit.current = null;
                if (!d) return;
                if (d.frame !== null) cancelAnimationFrame(d.frame);
                leftEl.current?.style.setProperty("--artwork-h", `${d.pct}%`);
                saveSplit(d.pct);
              }}
              onPointerCancel={() => {
                const d = dragSplit.current;
                dragSplit.current = null;
                if (d?.frame != null) cancelAnimationFrame(d.frame);
                leftEl.current?.style.setProperty("--artwork-h", `${splitPct}%`);
              }}
              onDoubleClick={() => saveSplit(SPLIT_DEFAULT)}
            >
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-shadow duration-150 group-hover:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-active:shadow-[0_0_4px_1px_rgba(59,130,246,0.5)]" />
              <span aria-hidden className="absolute top-1/2 left-1/2 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 flex-row items-center justify-center gap-1 rounded-full border bg-background shadow-sm group-hover:shadow-[0_0_4px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_4px_rgba(59,130,246,0.35)]">
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
              </span>
            </div>
          </div>
          <ArtworkPicker assets={assets} library={artworkLibrary} favoriteIds={favoriteIds} uploading={uploading} onUploadFiles={(f) => void uploadMany(f)} onPlace={(d) => void place(d)} onDelete={(id, name) => void deleteAsset(id, name)} />
        </aside>

        {/* Centre: rulers + canvas */}
        <div className="grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${RULER_SIZE}px 1fr`, gridTemplateRows: `${RULER_SIZE}px 1fr` }}>
          <div className="border-b border-r bg-[#f6f6f4]" />
          <div className="min-w-0 border-b"><Ruler orientation="horizontal" viewport={viewport} /></div>
          <div className="min-h-0 border-r"><Ruler orientation="vertical" viewport={viewport} /></div>
          <div
            ref={hostEl}
            className={`relative min-h-0 min-w-0 overflow-hidden ${dropping ? "ring-2 ring-inset ring-primary" : ""}`}
            data-testid="editor-canvas-host"
            onDragOver={(e) => { if (canDrop(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropping(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }}
            onDrop={dropOnCanvas}
          >
            <canvas ref={canvasEl} />
            {menu && selected.length ? (
              <div
                role="menu"
                aria-label="Artwork options"
                className="absolute z-20 min-w-36 rounded-lg border bg-background p-1 text-sm shadow-lg"
                style={{ left: menu.x, top: menu.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }}
              >
                {(
                  [
                    ["Bring to front", "Ctrl/Cmd+Shift+]", ArrowUpToLine, "front", menu.atTop],
                    ["Bring forward", "Ctrl/Cmd+]", ChevronUp, "forward", menu.atTop],
                    ["Send backward", "Ctrl/Cmd+[", ChevronDown, "backward", menu.atBottom],
                    ["Send to back", "Ctrl/Cmd+Shift+[", ArrowDownToLine, "back", menu.atBottom],
                  ] as const
                ).map(([label, keys, Icon, mode, off], i) => (
                  <button key={mode} type="button" role="menuitem" autoFocus={i === 0 && !off} disabled={off} title={`${label} (${keys})`} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => { setMenu(null); c?.arrange(mode); }}>
                    <Icon className="size-4" aria-hidden /> {label}
                  </button>
                ))}
                <div role="separator" className="my-1 h-px bg-border" />
                {canGroup ? (
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => { setMenu(null); c?.group(); }}>
                    <Group className="size-4" aria-hidden /> Group
                  </button>
                ) : null}
                {canUngroup ? (
                  <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => { setMenu(null); c?.ungroup(); }}>
                    <Ungroup className="size-4" aria-hidden /> Ungroup
                  </button>
                ) : null}
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => { setMenu(null); void c?.duplicateSelected(); }}>
                  <Copy className="size-4" aria-hidden /> Duplicate
                </button>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none" onClick={() => { setMenu(null); c?.removeSelected(); }}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </button>
              </div>
            ) : null}
            {bgMenu && backgrounds[bgMenu.index] ? (
              <div
                role="menu"
                aria-label="Background picture options"
                className="absolute z-20 min-w-48 whitespace-nowrap rounded-lg border bg-background p-1 text-sm shadow-lg"
                style={{ left: bgMenu.x, top: bgMenu.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Escape") setBgMenu(null); }}
              >
                {(
                  [
                    // While the picture is being moved and resized, "Done" comes first (it ends that); otherwise the way in.
                    bgEditing ? (["Done", Check, false, "done"] as const) : (["Move and resize", Move, false, "edit"] as const),
                    ["Bring forward", ChevronUp, bgMenu.index >= backgrounds.length - 1, "up"],
                    ["Send backward", ChevronDown, bgMenu.index <= 0, "down"],
                  ] as const
                ).map(([label, Icon, off, what], i) => (
                  <button key={label} type="button" role="menuitem" autoFocus={i === 0} disabled={off} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => { setBgMenu(null); bgAction(what, bgMenu.index); }}>
                    <Icon className="size-4" aria-hidden /> {label}
                  </button>
                ))}
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none" onClick={() => { setBgMenu(null); bgAction("remove", bgMenu.index); }}>
                  <Trash2 className="size-4" aria-hidden /> Remove background image
                </button>
              </div>
            ) : null}
            {facePick ? (
              <FaceColorBox
                key={facePick.panelId}
                name={geo.foldTree.panels.find((p) => p.id === facePick.panelId)?.label ?? facePick.panelId}
                color={faces[facePick.panelId] ?? null}
                left={Math.max(8, Math.min(facePick.x + 14, hostSize.w - 272))}
                top={Math.max(8, Math.min(facePick.y + 14, hostSize.h - 150))}
                onPick={(color) => ctl.current?.setFace(facePick.panelId, color)}
                onClose={() => {
                  setFacePick(null);
                  ctl.current?.chooseFace(null);
                }}
              />
            ) : null}
            <CanvasBar viewport={viewport} overlay={overlay} onOverlay={setOverlay} onBy={(f) => c?.zoomBy(f)} onFit={() => c?.zoomFit()} panMode={panMode} onPan={togglePan} faceTool={faceTool} onFace={toggleFace} />
          </div>
        </div>

        {threeVisible ? (
          <section className="relative min-h-0 min-w-0" aria-label="3D preview" aria-hidden={!show3d}>
            {/* Drag this edge to give the dieline or the 3D view more room (arrow keys too; double-click resets). */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the dieline and 3D view"
              aria-valuemin={MIN_3D}
              aria-valuenow={threeW ?? undefined}
              tabIndex={0}
              className={`group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none outline-none ${show3d && expanded && !animating ? "" : "pointer-events-none invisible"}`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const box = gridEl.current?.getBoundingClientRect();
                if (!box) return;
                draggedW.current = clampThreeW(box.right - RIGHT_W - e.clientX);
                setThreeW(draggedW.current);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                if (draggedW.current !== null) saveThreeW(draggedW.current);
                draggedW.current = null;
              }}
              onDoubleClick={() => saveThreeW(null)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const now = threeW ?? sectionWidth(e.currentTarget);
                saveThreeW(clampThreeW(now + (e.key === "ArrowLeft" ? 24 : -24)));
              }}
            >
              {/* Always visible and always the same shape: hover, keyboard focus and dragging only add a soft blue glow. */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-shadow duration-150 group-hover:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_3px_rgba(59,130,246,0.35)] group-active:shadow-[0_0_4px_1px_rgba(59,130,246,0.5)]" />
              <span aria-hidden className="absolute top-1/2 left-1/2 flex h-12 w-3 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border bg-background shadow-sm transition-shadow duration-150 group-hover:shadow-[0_0_4px_rgba(59,130,246,0.35)] group-focus-visible:shadow-[0_0_4px_rgba(59,130,246,0.35)] group-active:shadow-[0_0_5px_1px_rgba(59,130,246,0.5)]">
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
              </span>
            </div>
            {/* Clipped drawer: the preview keeps its full width while the column grows, so it slides in instead of being squeezed (no re-layout of the 3D canvas per frame). */}
            <div className={`absolute inset-0 overflow-hidden border-l transition-opacity motion-reduce:transition-none ${animating ? "duration-300" : "duration-0"} ${show3d && expanded ? "opacity-100" : "opacity-0"}`}>
              <div className="absolute inset-y-0 right-0" style={{ width: openW }}>
                <Preview3D initialView={initialView} geo={geo} artwork={artworkForPreview} settings={threeD} onSettings={updateThreeD} viewRef={view3d} watermark={watermark} />
              </div>
            </div>
          </section>
        ) : null}

        {/* Right: properties */}
        <aside className="min-h-0 overflow-auto border-l">
          <h2 className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Properties</h2>
          <PropertiesPanel
            object={selectedData}
            selectionCount={selected.length}
            onPatch={(p) => selected[0] && void c?.update(selected[0], p)}
            onAlign={(m) => c?.align(m)}
            multi={{
              count: selected.length,
              canGroup,
              canUngroup,
              onGroup: () => c?.group(),
              onUngroup: () => c?.ungroup(),
              onAlign: (m, to) => c?.align(m, to),
              onDistribute: (axis) => c?.distribute(axis),
              onScale: (f) => c?.scaleSelection(f),
              onRotate: (d) => c?.rotateSelection(d),
            }}
            onLock={(locked) => selected[0] && c?.setLocked(selected[0], locked)}
            background={{
              layers: backgrounds,
              selected: bgSelected,
              max: MAX_BACKGROUNDS,
              onSelect: (i) => c?.selectBackground(i),
              onRemove: (i) => void c?.removeBackground(i),
              onMove: (i, d) => c?.moveBackground(i, d),
              assets,
              names: { ...Object.fromEntries(assets.map((a) => [a.id, a.fileName])), ...libNames },
              library: backgroundLibrary,
              uploading,
              onPatch: (i, p) => void c?.patchBackground(i, p),
              onPick: (assetId) => void addBackground(assetId),
              onPickLibrary: (id) => void pickLibraryBackground(id),
              editing: bgEditing,
              onToggleEdit: () => ctl.current?.setBackgroundEdit(!ctl.current.isBackgroundEditing()),
              onUpload: () => bgFileInput.current?.click(),
              onDeleteAsset: (id, name) => void deleteAsset(id, name),
            }}
          />
        </aside>
      </div>
      {showExport ? (
        <ExportDialog
          overlay={overlay}
          projectId={projectId}
          name={name}
          geo={geo}
          getArtwork={() => ctl.current?.toArtwork() ?? { objects, backgrounds }}
          boardColor={threeD.outsideColor}
          flushSave={() => saver.settle(ctl.current?.toArtwork())}
          watermark={watermark}
          getGlb={async () => {
            if (!view3d.current) {
              setShow3d(true);
              for (let i = 0; i < 40 && !view3d.current; i++) await new Promise((r) => setTimeout(r, 100));
              await new Promise((r) => setTimeout(r, 800)); // let the artwork texture render
            }
            if (!view3d.current) throw new Error("The 3D preview could not be opened.");
            return view3d.current.exportGlb(watermark);
          }}
          onClose={() => setShowExport(false)}
        />
      ) : null}
    </div>
  );
}
