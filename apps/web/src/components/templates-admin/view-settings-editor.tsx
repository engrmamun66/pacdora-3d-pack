"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, RotateCcw, Save, Trash2 } from "lucide-react";
import { createImportedGenerator, generateDieline, importedDefaults, type DielineGeometry, type FlatDieline } from "@packaging/dieline-engine";
import { saveTemplateView, type TemplateViewData } from "@/app/doraadmin/template-view-actions";
import { Button } from "@/components/ui/button";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { notify } from "@/lib/notify";
import { STANDARD_VIEW, type ViewSettings } from "@/lib/view-settings";

/** Dieline geometry of a template at its default size (what customers see first). */
export function geometryForViewData(data: TemplateViewData): DielineGeometry {
  if (data.kind === "builtin") return generateDieline(data.generatorId, data.params);
  const flat = data.flat as FlatDieline;
  return createImportedGenerator(data.templateId, flat, data.fold).generate(importedDefaults(flat));
}

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
        <div className="overflow-hidden rounded-xl border bg-muted/40">
          <CartonView
            ref={ref}
            className="h-[min(520px,60vh)] w-full"
            geo={built.geo}
            texture={null}
            textureRect={null}
            progress={progress}
            outsideColor="#ffffff"
            insideColor="#c8a97e"
            initialView={startView}
            onViewChange={(v) => setLive((old) => ({ ...v, progress: old.progress }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">Drag to turn the box, scroll to zoom, right-drag or two fingers to move it. The numbers follow the camera.</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Camera className="size-4" aria-hidden /> Starting view</h3>
        <Num label="Turn (left/right)" value={current.azimuthDeg} suffix="°" step={1} min={-180} max={180} onCommit={(v) => move({ azimuthDeg: v })} />
        <Num label="Tilt (up/down)" value={current.elevationDeg} suffix="°" step={1} min={-89} max={89} onCommit={(v) => move({ elevationDeg: v })} />
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
        <p className="text-xs text-muted-foreground">
          {saved ? (dirty ? "Changed since the saved view." : "This is the saved starting view.") : dirty ? "No saved view yet: customers see the standard view." : "Standard view (nothing saved)."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !dirty} onClick={() => void save()}><Save className="size-4" aria-hidden /> Save view</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { move({ ...STANDARD_VIEW, progress }); }} title="Move the camera back to the standard position"><RotateCcw className="size-4" aria-hidden /> Standard</Button>
          {saved ? <Button type="button" variant="outline" disabled={busy} onClick={() => void clear()}><Trash2 className="size-4" aria-hidden /> Remove saved view</Button> : null}
        </div>
      </div>
    </div>
  );
}
