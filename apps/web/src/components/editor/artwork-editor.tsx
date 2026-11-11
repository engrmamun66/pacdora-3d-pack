"use client";

import { notify } from "@/lib/notify";
import "./fonts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";
import { createImportedGenerator, generateDieline, type FlatDieline, type FoldSetup, type WatermarkSpec } from "@packaging/dieline-engine";
import type { FlatDielineData } from "@packaging/svg-import";
import type { ViewSettings } from "@/lib/view-settings";
import type { Artwork, ArtworkObject, BoxBackground } from "@packaging/schema";
import { saveArtwork, saveThreeD } from "@/app/editor/[id]/actions";
import { Preview3D, type ThreeDSettings } from "@/components/viewer3d/preview-3d";
import type { CartonViewHandle } from "@/components/viewer3d/carton-view";
import { EditorController, type OverlayOptions, type Viewport } from "./editor-controller";
import { assetUrl } from "./fabric-map";
import { AutoSaver, type SaveState } from "@/lib/autosave";
import { ExportDialog } from "./export-dialog";
import { PropertiesPanel } from "./properties-panel";
import { RULER_SIZE, Ruler } from "./rulers";

type Asset = { id: string; fileName: string };

/** CSS pixels per millimetre (96 px per inch). */
const PX_PER_MM_AT_100 = 96 / 25.4;

const TYPE_ICON = { text: Type, image: ImagePlus, rect: Square, ellipse: Circle, line: Slash } as const;

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

export function ArtworkEditor({
  projectId,
  name,
  generatorId,
  imported,
  initialView = null,
  params,
  artwork: initialArtwork,
  assets: initialAssets,
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
  artwork: Artwork;
  assets: Asset[];
  threeD: ThreeDSettings;
  /** Put into the PNG and 3D downloads (the server adds it to the other files); null = none. */
  watermark?: WatermarkSpec | null;
}) {
  // Keyed by value: a props refresh with equal params must not rebuild the editor (and lose undo history).
  const paramsKey = JSON.stringify(params);
  const geo = useMemo(() => {
    try {
      return imported ? createImportedGenerator(imported.templateId, imported.flat as FlatDieline, imported.fold ?? null).generate(JSON.parse(paramsKey)) : generateDieline(generatorId, JSON.parse(paramsKey));
    } catch {
      return null;
    }
  }, [generatorId, imported, paramsKey]);
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
      onSelection: refreshSelection,
      onViewport: setViewport,
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

  // ------------------------------------------------------------ uploads
  const upload = async (file: File, as: "layer" | "background" = "layer") => {
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("projectId", projectId);
      const res = await fetch("/api/assets", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
      if (!res.ok || !json.asset) throw new Error(json.error ?? `Upload failed (${res.status}).`);
      setAssets((a) => [json.asset!, ...a]);
      if (as === "background") await ctl.current?.setBackground({ assetId: json.asset.id, fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 });
      else await ctl.current?.addImage(json.asset.id, json.asset.fileName);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (!geo) {
    return <p className="p-8 text-destructive">This project&apos;s box parameters no longer produce a valid dieline. Open the project settings and fix them first.</p>;
  }

  const c = ctl.current;
  const layers = [...objects].reverse(); // top first
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
        <ToolButton label="Upload image (PNG or JPEG, max 10 MB)" disabled={uploading} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" />
          {uploading ? <span>Uploading…</span> : null}
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
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
            if (f) void upload(f, "background");
          }}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Undo (Ctrl/Cmd+Z)" disabled={!history.canUndo} onClick={() => void c?.undo()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="Redo (Shift+Ctrl/Cmd+Z)" disabled={!history.canRedo} onClick={() => void c?.redo()}><Redo2 className="size-4" /></ToolButton>
        <ToolButton label="Duplicate (Ctrl/Cmd+D)" disabled={!selected.length} onClick={() => void c?.duplicateSelected()}><Copy className="size-4" /></ToolButton>
        <ToolButton label="Delete (Del)" disabled={!selected.length} onClick={() => c?.removeSelected()}><Trash2 className="size-4" /></ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Zoom out" onClick={() => c?.zoomBy(0.8)}><Minus className="size-4" /></ToolButton>
        <span className="w-12 text-center text-xs tabular-nums" title="100% = real size on a 96 dpi screen">{viewport ? `${Math.round((viewport.zoom / PX_PER_MM_AT_100) * 100)}%` : ""}</span>
        <ToolButton label="Zoom in" onClick={() => c?.zoomBy(1.25)}><Plus className="size-4" /></ToolButton>
        <ToolButton label="Fit to screen (Ctrl/Cmd+0)" onClick={() => c?.zoomFit()}><Maximize className="size-4" /></ToolButton>
        <div className="mx-1 h-5 w-px bg-border" />
        {(["showGrid", "showBleed", "showSafe"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 px-1 text-xs">
            <input type="checkbox" checked={overlay[k]} onChange={(e) => setOverlay((o) => ({ ...o, [k]: e.target.checked }))} />
            {{ showGrid: "Grid", showBleed: "Bleed", showSafe: "Safe area" }[k]}
          </label>
        ))}
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

      <div className={`grid min-h-0 ${show3d && foldable ? "grid-cols-[240px_1fr_minmax(280px,38%)_288px]" : "grid-cols-[240px_1fr_288px]"}`}>
        {/* Left: layers + uploads */}
        <aside className="flex min-h-0 flex-col border-r">
          <h2 className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layers</h2>
          <ul className="min-h-0 flex-1 overflow-auto py-1" aria-label="Layers (top first)">
            {layers.length === 0 ? <li className="px-3 py-2 text-xs text-muted-foreground">No artwork yet.</li> : null}
            {layers.map((o, i) => {
              const Icon = TYPE_ICON[o.type];
              const isSel = selected.includes(o.id);
              return (
                <li key={o.id} className={`group flex items-center gap-1 px-2 py-1 text-xs ${isSel ? "bg-primary/10" : "hover:bg-muted"}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => c?.select([o.id])}>
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={`truncate ${o.visible ? "" : "text-muted-foreground line-through"}`}>{o.name}</span>
                  </button>
                  <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100" title={o.visible ? "Hide" : "Show"} aria-label={o.visible ? `Hide ${o.name}` : `Show ${o.name}`} onClick={() => void c?.update(o.id, { visible: !o.visible })}>
                    {o.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100" title={o.locked ? "Unlock" : "Lock"} aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} onClick={() => c?.setLocked(o.id, !o.locked)}>
                    {o.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                  <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 disabled:opacity-20" title="Bring forward" aria-label={`Bring ${o.name} forward`} disabled={i === 0} onClick={() => c?.reorder(o.id, 1)}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100 disabled:opacity-20" title="Send backward" aria-label={`Send ${o.name} backward`} disabled={i === layers.length - 1} onClick={() => c?.reorder(o.id, -1)}>
                    <ArrowDown className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
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
          <h2 className="border-y px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your images</h2>
          <div className="grid max-h-56 grid-cols-3 gap-1 overflow-auto p-2">
            {assets.length === 0 ? <p className="col-span-3 text-xs text-muted-foreground">Uploaded images appear here.</p> : null}
            {assets.map((a) => (
              <button key={a.id} type="button" title={`Place ${a.fileName}`} className="aspect-square overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-ring" onClick={() => void c?.addImage(a.id, a.fileName)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(a.id)} alt={a.fileName} className="h-full w-full object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        </aside>

        {/* Centre: rulers + canvas */}
        <div className="grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${RULER_SIZE}px 1fr`, gridTemplateRows: `${RULER_SIZE}px 1fr` }}>
          <div className="border-b border-r bg-[#f6f6f4]" />
          <div className="min-w-0 border-b"><Ruler orientation="horizontal" viewport={viewport} /></div>
          <div className="min-h-0 border-r"><Ruler orientation="vertical" viewport={viewport} /></div>
          <div ref={hostEl} className="relative min-h-0 min-w-0 overflow-hidden" data-testid="editor-canvas-host">
            <canvas ref={canvasEl} />
          </div>
        </div>

        {show3d && foldable ? (
          <section className="min-h-0 min-w-0 border-l" aria-label="3D preview">
            <Preview3D initialView={initialView} geo={geo} artwork={artworkForPreview} settings={threeD} onSettings={updateThreeD} viewRef={view3d} />
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
