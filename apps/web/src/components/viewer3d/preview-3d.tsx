"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import type { DielineGeometry } from "@packaging/dieline-engine";
import type { Artwork, ProjectDoc } from "@packaging/schema";
import { renderArtwork, type RasterRect } from "@/components/editor/artwork-raster";
import type { ViewSettings } from "@/lib/view-settings";
import { CartonView, type CartonViewHandle } from "./carton-view";

export type ThreeDSettings = ProjectDoc["threeD"];

/**
 * Live 3D preview: renders the artwork in flat-sheet space (same mapping as the
 * 2D editor) and folds it with the engine's fold tree.
 */
export function Preview3D({
  geo,
  artwork,
  settings,
  onSettings,
  viewRef,
  initialView = null,
}: {
  initialView?: ViewSettings | null;
  geo: DielineGeometry;
  artwork: Artwork;
  settings: ThreeDSettings;
  onSettings: (s: ThreeDSettings) => void;
  viewRef?: React.RefObject<CartonViewHandle | null>;
}) {
  const [raster, setRaster] = useState<{ canvas: HTMLCanvasElement; rect: RasterRect } | null>(null);
  const [progress, setProgress] = useState(settings.foldProgress);
  const localRef = useRef<CartonViewHandle>(null);
  const inner = viewRef ?? localRef;
  const anim = useRef<number | null>(null);

  // Re-render the texture shortly after the artwork or board colour changes.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void renderArtwork(geo, artwork, { pxPerMm: 6, background: settings.outsideColor }).then((r) => {
        if (!cancelled) setRaster({ canvas: r.canvas, rect: r.rect });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [geo, artwork, settings.outsideColor]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  const animate = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setProgress(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CartonView
        ref={inner}
        initialView={initialView}
        className="min-h-0 flex-1"
        geo={geo}
        texture={raster?.canvas ?? null}
        textureRect={raster?.rect ?? null}
        progress={progress}
        outsideColor={settings.outsideColor}
        insideColor={settings.insideColor}
      />
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs">
        <label className="flex items-center gap-2">
          Fold
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(progress * 100)}
            aria-label="Fold amount"
            onChange={(e) => setProgress(Number(e.target.value) / 100)}
            onPointerUp={() => onSettings({ ...settings, foldProgress: progress })}
            onKeyUp={() => onSettings({ ...settings, foldProgress: progress })}
          />
          <span className="w-8 tabular-nums">{Math.round(progress * 100)}%</span>
        </label>
        <button type="button" className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted" onClick={animate}>
          <Play className="size-3" /> Fold
        </button>
        <button type="button" className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted" onClick={() => inner.current?.resetView()}>
          <RotateCcw className="size-3" /> View
        </button>
        <NativeColor label="Board" ariaLabel="Board colour (outside)" value={settings.outsideColor} onCommit={(outsideColor) => onSettings({ ...settings, outsideColor })} />
        <NativeColor label="Inside" ariaLabel="Inside colour" value={settings.insideColor} onCommit={(insideColor) => onSettings({ ...settings, insideColor })} />
      </div>
    </div>
  );
}

/** Colour input that commits when the picker closes (native change), not on every drag step. */
function NativeColor({ label, ariaLabel, value, onCommit }: { label: string; ariaLabel: string; value: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useEffectEvent((v: string) => v !== value && onCommit(v));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => commit(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [value]); // the input remounts (key) when the value changes
  return (
    <label className="flex items-center gap-1">
      {label}
      <input ref={ref} type="color" aria-label={ariaLabel} defaultValue={value} key={value} className="h-6 w-8" />
    </label>
  );
}
