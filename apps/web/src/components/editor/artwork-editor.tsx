"use client";

import { notify } from "@/lib/notify";
import "./fonts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Circle,
  Copy,
  Download,
  Hand,
  Group,
  Ungroup,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { applyWindows, createImportedGenerator, generateDieline, type FlatDieline, type FoldSetup, type WatermarkSpec, type WindowSpec } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import type { ViewSettings } from "@/lib/view-settings";
import type { Artwork, ArtworkObject, BoxBackground } from "@packaging/schema";
import { saveArtwork, saveThreeD } from "@/app/editor/[id]/actions";
import { Preview3D, type ThreeDSettings } from "@/components/viewer3d/preview-3d";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { EditorController, type OverlayOptions, type Viewport } from "./editor-controller";
import { AutoSaver, type SaveState } from "@/lib/autosave";
import { ExportDialog } from "./export-dialog";
import { LayerList } from "./layer-list";
import { ArtworkPicker, canDrop, readDragged, type Dragged, type PickerLibraryItem } from "./artwork-picker";
import { PropertiesPanel } from "./properties-panel";
import { RULER_SIZE, Ruler } from "./rulers";

type Asset = { id: string; fileName: string };

/** CSS pixels per millimetre (96 px per inch). */
const PX_PER_MM_AT_100 = 96 / 25.4;

/** Editor columns (px): the side panels are fixed; the dieline and the 3D view share the rest and can be resized. */
const LEFT_W = 240;
const RIGHT_W = 288;
const MIN_3D = 240;
const MIN_CANVAS = 320;


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

/** Bottom bar over the dieline: zoom (minus, plus, percentage, fit) and what to show on the sheet (grid, bleed, safe area). */
function CanvasBar({ viewport, overlay, onOverlay, onBy, onFit }: { viewport: Viewport | null; overlay: OverlayOptions; onOverlay: (o: OverlayOptions) => void; onBy: (f: number) => void; onFit: () => void }) {
  const z = viewport?.zoom ?? 1;
  return (
    <div className="absolute inset-x-2 bottom-3 z-10 mx-auto flex w-fit flex-wrap items-center justify-center gap-x-0.5 gap-y-0.5 rounded-lg border bg-background/95 px-1.5 py-1 shadow-md backdrop-blur" role="toolbar" aria-label="Dieline view">
      <ToolButton label="Zoom out (Ctrl/Cmd+-)" onClick={() => onBy(0.8)}><Minus className="size-4" /></ToolButton>
      <span className="w-10 text-center text-xs tabular-nums" title="100% = real size on a 96 dpi screen. Mouse wheel zooms, Shift + wheel moves sideways.">{viewport ? `${Math.round((z / PX_PER_MM_AT_100) * 100)}%` : ""}</span>
      <ToolButton label="Zoom in (Ctrl/Cmd++)" onClick={() => onBy(1.25)}><Plus className="size-4" /></ToolButton>
      <ToolButton label="Fit to screen (Ctrl/Cmd+0)" onClick={onFit}><Maximize className="size-4" /></ToolButton>
      <div className="mx-0.5 h-5 w-px bg-border" />
      {(["showGrid", "showBleed", "showSafe"] as const).map((k) => (
        <label key={k} className="flex items-center gap-1 px-0.5 text-xs">
          <input type="checkbox" checked={overlay[k]} onChange={(e) => onOverlay({ ...overlay, [k]: e.target.checked })} />
          {{ showGrid: "Grid", showBleed: "Bleed", showSafe: "Safe area" }[k]}
        </label>
      ))}
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
  threeD: initialThreeD,
  watermark = null,
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
  threeD: ThreeDSettings;
  /** Put into the PNG and 3D downloads (the server adds it to the other files); null = none. */
  watermark?: WatermarkSpec | null;
}) {
  // Keyed by value: a props refresh with equal params must not rebuild the editor (and lose undo history).
  const paramsKey = JSON.stringify(params);
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
  const [background, setBackground] = useState<BoxBackground | null>(initialArtwork.background ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedData, setSelectedData] = useState<ArtworkObject | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [overlay, setOverlay] = useState<OverlayOptions>({ showGrid: true, showBleed: true, showSafe: true });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [panMode, setPanMode] = useState(false);
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
  const [show3d, setShow3d] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [threeD, setThreeD] = useState<ThreeDSettings>(initialThreeD);
  const view3d = useRef<CartonViewHandle>(null);
  const artworkForPreview = useMemo<Artwork>(() => ({ objects, background }), [objects, background]);
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
        setBackground(art.background ?? null);
        saver.schedule(art);
      },
      onSelection: (ids) => {
        setMenu(null);
        refreshSelection(ids);
      },
      onViewport: (v) => {
        setMenu(null);
        setViewport(v);
      },
      // Keep the menu (about 150 x 90 px) inside the dieline area.
      onContextMenu: (at) => setMenu({ ...c.stackState(), x: Math.max(0, Math.min(at.x, (hostEl.current?.clientWidth ?? 0) - 190)), y: Math.max(0, Math.min(at.y, (hostEl.current?.clientHeight ?? 0) - 270)) }),
      onHistory: setHistory,
      onError: (text) => notify.error(text),
    });
    ctl.current = c;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __editor: c });
    const host = hostEl.current;
    c.resize(host.clientWidth, host.clientHeight);
    void c.init(initialArtwork);
    const ro = new ResizeObserver(([e]) => e && c.resize(Math.floor(e.contentRect.width), Math.floor(e.contentRect.height)));
    ro.observe(host);
    return () => {
      ro.disconnect();
      c.dispose();
      ctl.current = null;
    };
    // initialArtwork is only the starting state.
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => ctl.current?.setOverlay(overlay), [overlay]);

  // The right-click menu closes on any press outside it, and on Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[role=menu]")) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

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
  /** Upload one picture; it joins "My uploads". Returns the new asset, or null (the reason is shown). */
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
    if (added > 1 || (added === 1 && !opts.place)) notify.success(added === 1 ? "Picture added to My uploads." : `${added} pictures added to My uploads.`);
  };

  const uploadBackground = async (file: File) => {
    setUploading(true);
    const a = await uploadOne(file);
    setUploading(false);
    if (a) await ctl.current?.setBackground({ assetId: a.id, fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 });
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
  const saveLabel = { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving…", error: "Not saved" }[saveState];

  return (
    <div className="grid h-screen grid-rows-[48px_1fr] overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-1 border-b px-2">
        <Link href={`/projects/${projectId}`} className="mr-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
          ← <span className="font-medium">{name}</span>
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
            // One picture goes straight onto the dieline; several are added to My uploads to be dragged from there.
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
        <ToolButton label="Hand tool: drag to move the view (or hold Space, or drag with the right mouse button)" active={panMode} onClick={togglePan}><Hand className="size-4" /></ToolButton>
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
          <span className={`text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">{saveLabel}</span>
          <button type="button" onClick={saveNow} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/80">Save</button>
        </div>
      </header>

      <div
        ref={gridEl}
        className="grid min-h-0"
        style={{ gridTemplateColumns: show3d && foldable ? `${LEFT_W}px minmax(0,1fr) ${threeW === null ? "minmax(280px,38%)" : `${threeW}px`} ${RIGHT_W}px` : `${LEFT_W}px minmax(0,1fr) ${RIGHT_W}px` }}
      >
        {/* Left: layers + uploads */}
        <aside className="flex min-h-0 flex-col border-r">
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
          <button
            type="button"
            onClick={() => c?.select([])}
            className={`flex items-center gap-2 border-t px-3 py-1.5 text-left text-xs hover:bg-muted ${selected.length === 0 ? "bg-primary/10" : ""}`}
            title="Edit the box background"
          >
            <ImagePlus className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Box background</span>
            <span className="text-muted-foreground">{background ? "on" : "none"}</span>
          </button>
          <ArtworkPicker assets={assets} library={library} uploading={uploading} onUploadFiles={(f) => void uploadMany(f)} onPlace={(d) => void place(d)} />
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
            <CanvasBar viewport={viewport} overlay={overlay} onOverlay={setOverlay} onBy={(f) => c?.zoomBy(f)} onFit={() => c?.zoomFit()} />
          </div>
        </div>

        {show3d && foldable ? (
          <section className="relative min-h-0 min-w-0 border-l" aria-label="3D preview">
            {/* Drag this edge to give the dieline or the 3D view more room (arrow keys too; double-click resets). */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the dieline and 3D view"
              aria-valuemin={MIN_3D}
              aria-valuenow={threeW ?? undefined}
              tabIndex={0}
              className="group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none outline-none"
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
              {/* Always visible: a line down the edge and a grip in the middle, so it is clear this edge can be dragged. */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary group-active:w-0.5 group-active:bg-primary" />
              <span aria-hidden className="absolute top-1/2 left-1/2 flex h-12 w-3 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border bg-background shadow-sm transition-colors group-hover:border-primary group-hover:bg-primary/10 group-focus-visible:border-primary group-active:border-primary group-active:bg-primary/20">
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
                <span className="size-[3px] rounded-full bg-muted-foreground/70" />
              </span>
            </div>
            <Preview3D initialView={initialView} geo={geo} artwork={artworkForPreview} settings={threeD} onSettings={updateThreeD} viewRef={view3d} watermark={watermark} />
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
              value: background,
              assets,
              uploading,
              onPatch: (p) => void c?.setBackground(p),
              onPick: (assetId) => void c?.setBackground({ assetId, ...(background ? {} : { fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 }) }),
              onUpload: () => bgFileInput.current?.click(),
            }}
          />
        </aside>
      </div>
      {showExport ? (
        <ExportDialog
          projectId={projectId}
          name={name}
          geo={geo}
          getArtwork={() => ctl.current?.toArtwork() ?? { objects, background }}
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
