"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createImportedGenerator, getGenerator, getPreset, importedDefaults, type DielineGeometry, type FlatDieline } from "@packaging/dieline-engine";
import { outlinePathD } from "@packaging/render-svg";
import { CartonView, type CartonViewHandle } from "@/components/viewer3d/carton-view";
import { DEFAULT_BOX_COLOR, luminance, type HeroSettings, type HeroTemplate } from "@/lib/hero-settings";
import { START_OFFSET, STILL_STAGE, stageAt, stagedHinges, type HingeInfo } from "@/lib/hero-fold";

const PRESET = "straight-tuck-end-box";

/** The standard hero box: it comes from the same generator customers use, so the animation is the product. */
function defaultGeometry(): DielineGeometry {
  const preset = getPreset(PRESET)!;
  return getGenerator(preset.generatorId).generate({ ...preset.defaults, width: 70, depth: 45, height: 110 });
}

/** The box of the template the admin chose (at its standard size), or the standard box if that cannot be built. `standard` says which. */
function heroGeometry(template: HeroTemplate | null): { geo: DielineGeometry; standard: boolean } {
  try {
    if (template?.kind === "imported") {
      const flat = template.flat as FlatDieline;
      return { geo: createImportedGenerator(template.templateId, flat, template.fold).generate(importedDefaults(flat)), standard: false };
    }
    if (template?.kind === "builtin") {
      const preset = getPreset(template.presetId);
      if (preset) return { geo: getGenerator(preset.generatorId).generate({ ...preset.defaults }), standard: false };
    }
  } catch {
    // fall through to the standard box
  }
  return { geo: defaultGeometry(), standard: true };
}

const noopSubscribe = () => () => {};
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}
function useWebGL() {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return Boolean(document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl"));
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/** Printed look for the outside: a repeating pattern in flat-sheet space (it wraps around the folded box). */
function makeTexture(geo: DielineGeometry, color: string): { canvas: HTMLCanvasElement; rect: { minX: number; minY: number; width: number; height: number } } {
  const b = geo.bleedBounds;
  const rect = { minX: b.min.x, minY: b.min.y, width: b.max.x - b.min.x, height: b.max.y - b.min.y };
  const k = 6; // px per mm
  const c = document.createElement("canvas");
  c.width = Math.round(rect.width * k);
  c.height = Math.round(rect.height * k);
  const g = c.getContext("2d")!;
  // Indigo board, a fine diamond lattice, one amber band: reads well on the light grid.
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  // Light lattice on dark boxes, dark lattice on light boxes.
  g.strokeStyle = luminance(color) < 0.45 ? "rgb(255 255 255 / 0.28)" : "rgb(0 0 0 / 0.16)";
  g.lineWidth = 1.2 * (k / 6);
  const step = 12 * k;
  for (let d = -c.height; d < c.width + c.height; d += step) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + c.height, c.height);
    g.moveTo(d + c.height, 0);
    g.lineTo(d, c.height);
    g.stroke();
  }
  g.fillStyle = "#f5b942";
  g.fillRect(0, c.height * 0.46, c.width, 4 * k);
  g.fillStyle = "rgb(255 255 255 / 0.9)";
  g.fillRect(0, c.height * 0.46 + 6 * k, c.width, 0.8 * k);
  return { canvas: c, rect };
}

/** Flat dieline that draws itself (also the fallback when WebGL is missing). */
export function DielineLines({ geo, className }: { geo: DielineGeometry; className?: string }) {
  const b = geo.bleedBounds;
  const pad = 8;
  const vb = `${b.min.x - pad} ${b.min.y - pad} ${b.max.x - b.min.x + 2 * pad} ${b.max.y - b.min.y + 2 * pad}`;
  return (
    <svg viewBox={vb} className={className} aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {geo.cutLoops.map((loop, i) => (
        <path key={i} d={outlinePathD(loop)} pathLength={1} className="draw-line" stroke="currentColor" strokeWidth={0.7} />
      ))}
      {geo.creaseLines.map((c, i) => (
        <path key={i} d={`M${c.a.x} ${c.a.y}L${c.b.x} ${c.b.y}`} pathLength={1} className="draw-line-crease" stroke="currentColor" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

export function HeroCarton({ initial = "closed", color = DEFAULT_BOX_COLOR, template = null }: { initial?: HeroSettings["initial"]; color?: string; template?: HeroTemplate | null }) {
  const { geo, standard } = useMemo(() => heroGeometry(template), [template]);
  // The camera is framed for the sheet, since the animation opens the box flat: 150 mm for the standard box. Another template's box
  // sits on its root panel, so what counts is how far its sheet reaches from that panel's centre (1.4 x that).
  const frameMm = useMemo(() => {
    if (standard) return 150;
    const root = geo.foldTree.panels.find((p) => p.id === geo.foldTree.rootId);
    const xs = root?.polygon.map((v) => v.x) ?? [];
    const ys = root?.polygon.map((v) => v.y) ?? [];
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : (geo.cutBounds.min.x + geo.cutBounds.max.x) / 2;
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : (geo.cutBounds.min.y + geo.cutBounds.max.y) / 2;
    const reach = Math.max(cx - geo.cutBounds.min.x, geo.cutBounds.max.x - cx, cy - geo.cutBounds.min.y, geo.cutBounds.max.y - cy);
    return Math.max(60, reach * 1.4);
  }, [geo, standard]);
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const tex = useMemo(() => (webgl ? makeTexture(geo, color) : null), [geo, webgl, color]);
  const view = useRef<CartonViewHandle>(null);
  const hinges = useMemo<HingeInfo[]>(() => {
    const role = new Map(geo.foldTree.panels.map((p) => [p.id, p.role as string]));
    return geo.foldTree.hinges.map((h) => ({ id: h.id, childRole: role.get(h.childId) ?? "body" }));
  }, [geo]);

  // Drive the staged fold straight into the 3D view, once per display frame, with no React render in between.
  // With reduced motion the box just sits in the chosen starting pose.
  useEffect(() => {
    if (!webgl) return;
    const apply = (t: number) => view.current?.setProgress(t, stagedHinges(hinges, t));
    if (reduced) {
      const id = requestAnimationFrame(() => apply(STILL_STAGE[initial]));
      return () => cancelAnimationFrame(id);
    }
    let id = 0;
    let lastStep = -1;
    const start = performance.now() - START_OFFSET[initial] * 1000;
    const tick = (now: number) => {
      const t = stageAt((now - start) / 1000);
      const step = Math.round(t * 400); // skip rebuilds that change nothing visible
      if (step !== lastStep) {
        lastStep = step;
        apply(step / 400);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced, webgl, hinges, initial, tex]); // tex: a new texture rebuilds the model, so re-apply the current pose

  return (
    <div className="relative size-full">
      <DielineLines geo={geo} className="absolute inset-0 m-auto h-[88%] w-[88%] -rotate-6 text-primary/20" />
      {webgl && tex ? (
        <>
          {/* Soft contact shadow: a plain gradient, so it never flickers like a real-time shadow map. */}
          <div aria-hidden className="absolute bottom-[20%] left-1/2 h-[6%] w-[40%] -translate-x-1/2 rounded-[50%] bg-black/15 blur-xl" />
          <CartonView
            ref={view}
            className="absolute inset-0"
            geo={geo}
            texture={tex.canvas}
            textureRect={tex.rect}
            progress={STILL_STAGE[initial]}
            outsideColor={color}
            insideColor="#d9b98a"
            autoRotate={!reduced}
            transparent
            rotateOnly
            shadows={false}
            frameMm={frameMm}
          />
        </>
      ) : null}
    </div>
  );
}
