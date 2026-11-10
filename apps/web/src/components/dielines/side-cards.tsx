"use client";

import { useRef } from "react";
import { Play, RotateCcw } from "lucide-react";
import type { DielineGeometry } from "@packaging/dieline-engine";
import { ILLUSTRATOR_PROFILES } from "@packaging/render-print/profiles";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import type { ViewSettings } from "@/lib/view-settings";

export type DownloadFormat = "ai" | "pdf" | "dxf" | "svg" | "glb";

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
}: {
  initialView?: ViewSettings | null;
  geo: DielineGeometry;
  progress: number;
  onProgress: (p: number) => void;
  color: string;
  viewRef: React.RefObject<CartonViewHandle | null>;
}) {
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
    <section aria-label="3D preview" className="shrink-0 overflow-hidden rounded-2xl border bg-muted/40">
      <CartonView ref={viewRef} className="h-56 w-full" geo={geo} texture={null} textureRect={null} progress={progress} outsideColor={color} insideColor="#c8a97e" initialView={initialView} />
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
        {formats.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={format === f.value}
            onClick={() => onFormat(f.value)}
            className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors ${format === f.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
          >
            <span className="font-medium">{f.label}</span>
            <span className="text-xs text-muted-foreground">{f.ext}</span>
          </button>
        ))}
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
