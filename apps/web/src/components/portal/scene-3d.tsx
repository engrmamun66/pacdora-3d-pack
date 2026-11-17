"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { applyWindows, createImportedGenerator, generateDieline } from "@packaging/dieline-engine";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { renderArtwork, type RasterRect } from "@/components/editor/artwork-raster";
import { setAssetUrlBase } from "@/components/editor/fabric-map";
import type { PortalScene } from "@/server/portal";

/** The box of a shared template in 3D: drag to turn, scroll to zoom, a slider (and a button) to fold it. */
export function Scene3D({ userHash, scene, foldable, onFoldable }: { userHash: string; scene: PortalScene; foldable: boolean; onFoldable: (v: boolean) => void }) {
  const [raster, setRaster] = useState<{ canvas: HTMLCanvasElement; rect: RasterRect } | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(scene.initialView?.progress ?? scene.threeD.foldProgress);
  const view = useRef<CartonViewHandle>(null);
  const anim = useRef<number | null>(null);

  // Effects run in order, so this is set before the texture below asks for the pictures.
  // Pictures come from the public route of this page, not the owner's private one. Put it back when the view goes away.
  useEffect(() => {
    setAssetUrlBase(`/api/portal/assets/${encodeURIComponent(userHash)}`);
    return () => setAssetUrlBase("/api/assets");
  }, [userHash]);

  const geo = useMemo(() => {
    try {
      const base = scene.imported ? createImportedGenerator(scene.imported.templateId, scene.imported.flat, scene.imported.fold ?? null).generate(scene.params) : generateDieline(scene.generatorId, scene.params);
      return applyWindows(base, scene.windows).geo;
    } catch {
      return null;
    }
  }, [scene]);

  useEffect(() => onFoldable((geo?.foldTree.hinges.length ?? 0) > 0), [geo, onFoldable]);

  useEffect(() => {
    if (!geo) return;
    let cancelled = false;
    renderArtwork(geo, scene.artwork, { pxPerMm: 6, background: scene.threeD.outsideColor })
      .then((r) => !cancelled && setRaster({ canvas: r.canvas, rect: r.rect }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [geo, scene]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  const fold = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setProgress(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };

  if (!geo || failed) return <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">The 3D view is not available for this template.</div>;
  return (
    <div className="flex h-full flex-col">
      <CartonView ref={view} className="min-h-0 flex-1" geo={geo} texture={raster?.canvas ?? null} textureRect={raster?.rect ?? null} progress={progress} outsideColor={scene.threeD.outsideColor} insideColor={scene.threeD.insideColor} initialView={scene.initialView} watermark={scene.watermark} />
      <div className="flex flex-wrap items-center gap-3 border-t bg-background/80 px-3 py-2 text-xs">
        {foldable ? (
          <>
            <label className="flex items-center gap-2">
              Fold
              <input type="range" min={0} max={100} value={Math.round(progress * 100)} aria-label="Fold amount" onChange={(e) => setProgress(Number(e.target.value) / 100)} />
              <span className="w-8 tabular-nums">{Math.round(progress * 100)}%</span>
            </label>
            <button type="button" onClick={fold} className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><Play className="size-3" aria-hidden /> Fold</button>
          </>
        ) : (
          <span className="text-muted-foreground">This dieline is flat.</span>
        )}
        <button type="button" onClick={() => view.current?.resetView()} className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><RotateCcw className="size-3" aria-hidden /> Reset view</button>
        <span className="ml-auto text-muted-foreground">Drag to turn · scroll to zoom</span>
      </div>
    </div>
  );
}
