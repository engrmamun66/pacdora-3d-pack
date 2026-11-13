"use client";

import { useRef } from "react";
import { Box, Check, DraftingCompass, FileText, PenTool, Play, RotateCcw, Spline, type LucideIcon } from "lucide-react";
import type { DielineGeometry, WatermarkSpec } from "@packaging/dieline-engine";
import { ILLUSTRATOR_PROFILES } from "@packaging/render-print/profiles";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { boardLookOf } from "@/lib/board-look";
import { GridToggle } from "@/components/viewer3d/grid-toggle";
import { RotationControls } from "@/components/viewer3d/rotation-controls";
import type { ViewSettings } from "@/lib/view-settings";

export type DownloadFormat = "ai" | "pdf" | "dxf" | "svg" | "glb";

/** Look of one format card: its icon and colours (full class names so Tailwind finds them). */
interface FormatTone {
  readonly icon: LucideIcon;
  /** Icon tile. */
  readonly tile: string;
  /** Card when it is the chosen one. */
  readonly on: string;
  /** Card hover. */
  readonly hover: string;
  /** Check mark on the chosen card. */
  readonly check: string;
}

const FORMAT_TONES: Record<DownloadFormat, FormatTone> = {
  ai: {
    icon: PenTool,
    tile: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
    on: "border-orange-400 bg-orange-50 ring-1 ring-orange-400 dark:bg-orange-500/10",
    hover: "hover:border-orange-300 hover:bg-orange-50/60 dark:hover:bg-orange-500/5",
    check: "bg-orange-500",
  },
  pdf: {
    icon: FileText,
    tile: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    on: "border-red-400 bg-red-50 ring-1 ring-red-400 dark:bg-red-500/10",
    hover: "hover:border-red-300 hover:bg-red-50/60 dark:hover:bg-red-500/5",
    check: "bg-red-500",
  },
  dxf: {
    icon: DraftingCompass,
    tile: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    on: "border-sky-400 bg-sky-50 ring-1 ring-sky-400 dark:bg-sky-500/10",
    hover: "hover:border-sky-300 hover:bg-sky-50/60 dark:hover:bg-sky-500/5",
    check: "bg-sky-500",
  },
  svg: {
    icon: Spline,
    tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    on: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400 dark:bg-emerald-500/10",
    hover: "hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5",
    check: "bg-emerald-500",
  },
  glb: {
    icon: Box,
    tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    on: "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:bg-violet-500/10",
    hover: "hover:border-violet-300 hover:bg-violet-50/60 dark:hover:bg-violet-500/5",
    check: "bg-violet-500",
  },
};

export const DOWNLOAD_FORMATS: { value: DownloadFormat; label: string; ext: string; hint: string }[] = [
  { value: "ai", label: "Illustrator", ext: ".ai", hint: "PDF-compatible .ai for the chosen Illustrator version, die lines as named spot colours on their own layers." },
  { value: "pdf", label: "PDF", ext: ".pdf", hint: "Vector PDF, die lines as named spot colours on their own layers, trim and bleed boxes set." },
  { value: "dxf", label: "DXF", ext: ".dxf", hint: "Cut and crease lines only, on CUT and CREASE layers, in millimetres." },
  { value: "svg", label: "SVG", ext: ".svg", hint: "Vector, millimetre units, named layers." },
  { value: "glb", label: "3D model", ext: ".glb", hint: "The folded carton as shown in the preview, in metres." },
];

/** Folded carton with an Open/Close slider. 0 = flat sheet, 1 = closed. */
export function FoldPreview({
  geo,
  progress,
  onProgress,
  color,
  viewRef,
  initialView = null,
  large = false,
  thickness = 0,
  watermark = null,
  materialId,
  onReady,
}: {
  /** Called once when the box has been built and drawn. */
  onReady?: () => void;
  /** Board family (units.ts id): decides the look of the inside, the cut edge and the surface grain. */
  materialId?: string;
  /** Board thickness in mm, shown as the thickness of the panels in 3D. */
  thickness?: number;
  /** Printed faintly on the outside of the box; null = none. */
  watermark?: WatermarkSpec | null;
  initialView?: ViewSettings | null;
  /** Fill the space it is in (the centre of the page) instead of a small card. */
  large?: boolean;
  geo: DielineGeometry;
  progress: number;
  onProgress: (p: number) => void;
  color: string;
  viewRef: React.RefObject<CartonViewHandle | null>;
}) {
  const look = boardLookOf(materialId);
  const anim = useRef<number | null>(null);
  const play = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = progress >= 0.99 ? 0 : progress;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      onProgress(from + (1 - from) * e);
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };
  return (
    <section aria-label="3D preview" className={`relative overflow-hidden rounded-2xl border bg-muted/40 ${large ? "flex min-h-0 flex-1 flex-col" : "shrink-0"}`}>
      <CartonView ref={viewRef} className={large ? "min-h-0 w-full flex-1" : "h-56 w-full"} geo={geo} texture={null} textureRect={null} progress={progress} outsideColor={color} insideColor={look.inside} thickness={thickness} watermark={watermark} boardGrain={look.grain} boardEdge={{ color: look.edge, flute: look.flute }} initialView={initialView} {...(onReady ? { onReady } : {})} />
      <div className="flex items-center gap-2 border-t bg-background px-3 py-2 text-xs">
        <label className="flex flex-1 items-center gap-2">
          Open
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(progress * 100)}
            aria-label="Fold amount: open to closed"
            className="flex-1"
            onChange={(e) => onProgress(Number(e.target.value) / 100)}
          />
          Close
        </label>
        <button type="button" aria-label="Play fold animation" className="flex size-7 items-center justify-center rounded-md border hover:bg-muted" onClick={play}>
          <Play className="size-3.5" />
        </button>
        <button type="button" aria-label="Reset camera" className="flex size-7 items-center justify-center rounded-md border hover:bg-muted" onClick={() => viewRef.current?.resetView()}>
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <GridToggle viewRef={viewRef} />
      <RotationControls viewRef={viewRef} />
    </section>
  );
}

export function FormatCard({
  formats = DOWNLOAD_FORMATS,
  format,
  onFormat,
  profile,
  onProfile,
  checks,
  unverified,
  result,
}: {
  /** Formats offered (the 3D model is left out for flat-only dielines). */
  formats?: typeof DOWNLOAD_FORMATS;
  format: DownloadFormat;
  onFormat: (f: DownloadFormat) => void;
  profile: string;
  onProfile: (p: string) => void;
  checks: { pass: number; total: number };
  unverified: readonly string[];
  result: { ok: boolean; title: string; notes: string[] } | null;
}) {
  const meta = DOWNLOAD_FORMATS.find((f) => f.value === format)!;
  const profiles = ILLUSTRATOR_PROFILES.filter((p) => p.ai);
  const effective = profiles.some((p) => p.id === profile) ? profile : profiles[0]!.id;
  return (
    <section aria-label="Download" className="flex shrink-0 flex-col gap-4 rounded-2xl border p-4">
      <h2 className="font-semibold">File formats</h2>
      <div role="radiogroup" aria-label="File format" className="grid grid-cols-2 gap-2">
        {formats.map((f) => {
          const tone = FORMAT_TONES[f.value];
          const Icon = tone.icon;
          const on = format === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onFormat(f.value)}
              className={`relative flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${on ? tone.on : tone.hover}`}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone.tile}`} aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium whitespace-nowrap">{f.label}</span>
                <span className="text-xs text-muted-foreground">{f.ext}</span>
              </span>
              {on ? (
                <span className={`absolute right-1.5 bottom-1.5 grid size-4 place-items-center rounded-full text-white ${tone.check}`} aria-hidden>
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{meta.hint}</p>

      {format === "ai" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-version" className="text-xs font-medium">Illustrator version</label>
          <select id="ai-version" value={effective} onChange={(e) => onProfile(e.target.value)} aria-describedby="ai-version-hint" className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.label}{p.tested ? "" : " (untested)"}</option>
            ))}
          </select>
          <p id="ai-version-hint" className="text-xs text-amber-700 dark:text-amber-400">Untested: not yet opened in that real Illustrator version. Check before sending to print.</p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">Press <span className="font-medium text-foreground">Download the dieline</span> at the top to get the {meta.label} file ({meta.ext}).</p>

      {result ? (
        <div role={result.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-sm ${result.ok ? "" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
          <p className="font-medium">{result.title}</p>
          {result.notes.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-sm font-medium">You will get</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>True size in millimetres, die lines only (add artwork in the editor, then export from there).</li>
          <li>Geometry checked by the engine: {checks.pass} of {checks.total} checks pass.</li>
          <li>The view toggles (dimensions, bleed, safe area, glue) apply to the download where the format can show them.</li>
          {unverified.length ? <li>Built-in defaults for {unverified.join(", ")}: confirm with your printer.</li> : null}
        </ul>
      </div>
    </section>
  );
}
