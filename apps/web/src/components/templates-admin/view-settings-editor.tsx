"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, ImageDown, RotateCcw, Save, Trash2 } from "lucide-react";
import { createImportedGenerator, generateDieline, importedDefaults, type DielineGeometry, type FlatDieline } from "@packaging/dieline-engine";
import { saveTemplateView, type TemplateViewData } from "@/app/doraadmin/template-view-actions";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { GridToggle } from "@/components/viewer3d/grid-toggle";
import { notify } from "@/lib/notify";
import { STANDARD_VIEW, type ViewSettings } from "@/lib/view-settings";

/** Dieline geometry of a template at its default size (what customers see first). */
export function geometryForViewData(data: TemplateViewData): DielineGeometry {
  if (data.kind === "builtin") return generateDieline(data.generatorId, data.params);
  const flat = data.flat as FlatDieline;
  return createImportedGenerator(data.templateId, flat, data.fold).generate(importedDefaults(flat));
}

/** Size of the picture saved for the template list: portrait, because it fills the narrow right side of a card. */
const PRODUCT_IMAGE = { width: 900, height: 1200 } as const;

const same = (a: ViewSettings | null, b: ViewSettings | null) =>
  a === b || (a !== null && b !== null && (Object.keys(a) as (keyof ViewSettings)[]).every((k) => Math.abs(Number(a[k]) - Number(b[k])) < 0.011));

function Num({ label, value, suffix, step, min, max, onCommit }: { label: string; value: number; suffix: string; step: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(Math.round(value * 100) / 100);
  const commit = () => {
    if (text === null) return;
    const n = Number(text);
    setText(null);
    if (text.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
  };
  return (
    <label className="grid grid-cols-[110px_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          type="number"
          step={step}
          min={min}
          max={max}
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        />
        <span className="w-6 text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

/**
 * Set the view a template's 3D preview starts with. Turn, zoom and pan the box as a
 * customer would; the numbers follow the camera (or type them), and "Save view"
 * stores exactly what is on screen, including how far the box is folded.
 */
export function ViewSettingsEditor({ slug, data, onSaved }: { slug: string; data: TemplateViewData; onSaved?: (v: ViewSettings | null) => void }) {
  const ref = useRef<CartonViewHandle>(null);
  const [saved, setSaved] = useState<ViewSettings | null>(data.view);
  const [live, setLive] = useState<ViewSettings>(data.view ?? STANDARD_VIEW);
  const [progress, setProgress] = useState((data.view ?? STANDARD_VIEW).progress);
  const [busy, setBusy] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(data.productImage);
  const built = useMemo(() => {
    try {
      return { geo: geometryForViewData(data), error: null };
    } catch (e) {
      return { geo: null, error: e instanceof Error ? e.message : "This template could not be built." };
    }
  }, [data]);
  const [startView] = useState(data.view); // the view the 3D starts with; later moves come from the camera itself

  const current: ViewSettings = { ...live, progress };
  const dirty = !same(current, saved);

  const move = (patch: Partial<ViewSettings>) => {
    const next = { ...current, ...patch };
    if ("progress" in patch) setProgress(next.progress);
    else ref.current?.setView(next);
    setLive(next);
  };

  async function save() {
    const v = ref.current?.getView() ?? current;
    setBusy(true);
    try {
      const r = await saveTemplateView(slug, { ...v, progress });
      if (r.ok) {
        notify.success(r.message);
        setSaved({ ...v, progress });
        onSaved?.({ ...v, progress });
      } else notify.error(r.message);
    } catch {
      notify.error("Could not save the view. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Take a picture of the box exactly as it is on screen and keep it as the template's list image. */
  async function saveProductImage() {
    const url = ref.current?.snapshot(PRODUCT_IMAGE);
    if (!url) return notify.error("The 3D view is not ready yet.");
    setBusy(true);
    try {
      const blob = await (await fetch(url)).blob();
      const body = new FormData();
      body.set("slug", slug);
      body.set("file", new File([blob], `${slug}.png`, { type: "image/png" }));
      const res = await fetch("/api/doraadmin/template-product-image", { method: "POST", body });
      const out = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? `Could not save the image (${res.status}).`);
      setProductImage(out.url);
      notify.success("Product image saved", { description: "The template list now shows this picture." });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not save the image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProductImage() {
    setBusy(true);
    try {
      const res = await fetch(`/api/doraadmin/template-product-image?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the image.");
      setProductImage(null);
      notify.success("Product image removed");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not remove the image.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const r = await saveTemplateView(slug, null);
      if (r.ok) {
        notify.success(r.message);
        setSaved(null);
        onSaved?.(null);
        setProgress(STANDARD_VIEW.progress);
        setLive(STANDARD_VIEW);
        ref.current?.setView(STANDARD_VIEW);
      } else notify.error(r.message);
    } catch {
      notify.error("Could not clear the view. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!built.geo) return <p role="alert" className="text-sm text-destructive">{built.error}</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-2">
        {/* 3:4, the shape of the product image, so what you see is what gets saved. */}
        <div className="relative mx-auto w-full overflow-hidden rounded-xl border bg-muted/40" style={{ maxWidth: "min(100%, 52vh)" }}>
          <CartonView
            ref={ref}
            className="aspect-[3/4] w-full"
            geo={built.geo}
            texture={null}
            textureRect={null}
            progress={progress}
            outsideColor="#ffffff"
            insideColor="#c8a97e"
            initialView={startView}
            onViewChange={(v) => setLive((old) => ({ ...v, progress: old.progress }))}
          />
          <GridToggle viewRef={ref} />
          {/* The template list crops the picture to its middle: these lines show what stays. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-[71%] -translate-x-1/2 border-x border-dashed border-foreground/30" />
        </div>
        <p className="text-xs text-muted-foreground">Drag to turn the box, scroll to zoom, right-drag or two fingers to move it. The numbers follow the camera. Between the dashed lines is what the template list shows of the product image.</p>
      </div>

      <div className="flex flex-col gap-4">
        <section aria-label="Starting view" className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Camera className="size-4" aria-hidden /> Starting view</h3>
            {saved ? (
              dirty ? <StatusPill tone="amber">Unsaved changes</StatusPill> : <StatusPill tone="green">Saved</StatusPill>
            ) : (
              <StatusPill tone="grey">{dirty ? "Not saved" : "Standard view"}</StatusPill>
            )}
          </div>
          <Num label="Turn (left/right)" value={current.azimuthDeg} suffix="°" step={1} min={-180} max={180} onCommit={(v) => move({ azimuthDeg: v })} />
          <Num label="Tilt (up/down)" value={current.elevationDeg} suffix="°" step={1} min={-89} max={89} onCommit={(v) => move({ elevationDeg: v })} />
          <Num label="Roll (sideways)" value={current.rollDeg} suffix="°" step={1} min={-180} max={180} onCommit={(v) => move({ rollDeg: v })} />
          <Num label="Zoom" value={current.zoom} suffix="×" step={0.05} min={0.2} max={10} onCommit={(v) => move({ zoom: v })} />
          <Num label="Move X" value={current.panX * 100} suffix="%" step={1} min={-300} max={300} onCommit={(v) => move({ panX: v / 100 })} />
          <Num label="Move Y" value={current.panY * 100} suffix="%" step={1} min={-300} max={300} onCommit={(v) => move({ panY: v / 100 })} />
          <label className="grid grid-cols-[110px_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">Folded</span>
            <span className="flex items-center gap-2">
              <input type="range" min={0} max={100} value={Math.round(progress * 100)} aria-label="How far the box is folded" className="flex-1" onChange={(e) => move({ progress: Number(e.target.value) / 100 })} />
              <span className="w-10 text-right text-xs tabular-nums">{Math.round(progress * 100)}%</span>
            </span>
          </label>
          <div className="flex flex-col gap-2 border-t pt-3">
            <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => void save()}><Save className="size-4" aria-hidden /> Save view</Button>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { move({ ...STANDARD_VIEW, progress }); }} title="Move the camera back to the standard position"><RotateCcw aria-hidden /> Standard view</Button>
              {saved ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void clear()}><Trash2 aria-hidden /> Remove saved</Button> : null}
            </div>
            {!saved ? <p className="text-xs text-muted-foreground">Customers see the standard view until you save one.</p> : null}
          </div>
        </section>

        <section aria-label="Product image" className="flex flex-col gap-3 rounded-xl border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageDown className="size-4" aria-hidden /> Product image</h3>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            {productImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview of a stored PNG
              <img src={productImage} alt="The saved product image" className="aspect-[3/4] w-full rounded-lg border bg-muted/40 object-cover" />
            ) : (
              <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
                <span className="flex flex-col items-center gap-1 text-[11px]"><ImageDown className="size-5" aria-hidden /> No image</span>
              </div>
            )}
            <div className="flex min-w-0 flex-col justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {productImage ? "Shown next to the dieline in the template list." : "A picture of the box exactly as it is on screen. The template list shows it next to the dieline."}
              </p>
              <div className="flex flex-col gap-1.5">
                <Button type="button" size="lg" className="w-full whitespace-nowrap" disabled={busy || !built.geo} onClick={() => void saveProductImage()}>
                  <ImageDown className="size-4" aria-hidden /> {productImage ? "Replace image" : "Save as product image"}
                </Button>
                {productImage ? (
                  <Button type="button" variant="ghost" size="sm" className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void removeProductImage()}><Trash2 aria-hidden /> Remove image</Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "green" | "amber" | "grey"; children: React.ReactNode }) {
  const color = tone === "green" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : tone === "amber" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{children}</span>;
}
