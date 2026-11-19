"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { CaptureDesign, PortalScene } from "@/server/portal";
import { getCaptureDesign } from "./capture-actions";
import { useSampleDesign } from "./sample-design";
import type { FeaturedBackground } from "@/server/layouts";
import type { LayoutItem } from "@/lib/scene-layout";

const Scene3D = dynamic(() => import("./scene-3d").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D view…</div>,
});

/**
 * The picture on a shared template page: the box in 3D (the dieline view is hidden from customers).
 * Sample tabs on the left set how the box is arranged (the layouts the admin made); the featured backgrounds
 * under the picture are tried behind the box at once. `scene` is null when the template cannot be shown in 3D:
 * the flat picture is the only thing to show then.
 */
export function TemplatePreview({
  userHash,
  name,
  thumbnail,
  scene,
  layouts = [],
  backgrounds = [],
}: {
  userHash: string;
  name: string;
  thumbnail: string | null;
  scene: PortalScene | null;
  layouts?: LayoutItem[];
  backgrounds?: FeaturedBackground[];
}) {
  // Whether the dieline folds is only known once the box is built; a flat one says so.
  const [foldable, setFoldable] = useState(true);
  const [layoutId, setLayoutId] = useState<string | null>(layouts[0]?.id ?? null);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const background = backgrounds.find((b) => b.id === backgroundId) ?? null;

  // A design sample picked under the name: its design is fetched, and the 3D view shows it (box size, artwork, backgrounds, colours), with its layout, fold and camera.
  const { selected } = useSampleDesign();
  const sample = scene?.captures.find((c) => c.id === selected) ?? null;
  const [loaded, setLoaded] = useState<{ id: string; design: CaptureDesign | null } | null>(null);
  useEffect(() => {
    if (!sample) return;
    let live = true;
    getCaptureDesign(userHash, sample.id)
      .then((design) => live && setLoaded({ id: sample.id, design }))
      .catch(() => live && setLoaded({ id: sample.id, design: null }));
    return () => {
      live = false;
    };
  }, [userHash, sample]);
  const ready = sample !== null && loaded?.id === sample.id;
  // One object while nothing changes: the 3D view rebuilds its box whenever it gets a new one.
  const shown = useMemo<PortalScene | null>(
    () => {
      if (!scene || !sample || !ready) return scene;
      // The sample's design (box size, artwork, backgrounds, colours), folded, with the template's own camera.
      const design = loaded.design;
      return { ...scene, ...(design ?? {}), threeD: { ...(design?.threeD ?? scene.threeD), foldProgress: 1 }, initialView: scene.initialView ? { ...scene.initialView, progress: 1 } : null };
    },
    [scene, sample, ready, loaded],
  );
  // The layout is the visitor's pick in the tabs below: it stays whichever design sample is open.
  const layout = layouts.find((l) => l.id === layoutId) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="paper-grid sheet marks relative aspect-[4/3] overflow-hidden">
        {sample && ready && !loaded.design ? (
          // A sample taken before samples kept their design: only its picture is true to it, so that is what is shown.
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- the saved picture, exactly as the Client took it */}
            <img src={sample.url} alt="Design sample" className="min-h-0 max-w-full flex-1 object-contain" />
            <p className="text-xs text-muted-foreground">This sample is a picture only.</p>
          </div>
        ) : shown ? (
          <Scene3D key={sample && ready ? sample.id : "current"} userHash={userHash} scene={shown} onFoldable={setFoldable} foldable={foldable} layout={layout?.spec ?? null} backgroundUrl={background ? `/api/portal/backgrounds/${background.id}` : null} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
              <img src={thumbnail} alt={name} className="max-h-full max-w-full" />
            ) : (
              <span className="text-sm text-muted-foreground">No preview</span>
            )}
          </div>
        )}
      </div>

      {scene && layouts.length > 0 ? (
        <div role="tablist" aria-label="Sample layouts" className="flex items-start gap-2 overflow-x-auto px-1 pt-1 pb-1.5">
          {layouts.map((l, i) => {
            const on = l.id === layoutId;
            return (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={on}
                title={l.name}
                onClick={() => setLayoutId(l.id)}
                className="group flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl p-0.5 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className={`relative block aspect-square w-full overflow-hidden rounded-xl border bg-card shadow-xs transition-all ${on ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-background" : "group-hover:-translate-y-0.5 group-hover:shadow-md"}`}>
                  {l.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the layout's icon, a small PNG
                    <img src={l.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <SamplePlaceholder />
                  )}
                </span>
                <span className={`text-xs font-medium whitespace-nowrap ${on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>Sample {i + 1}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {scene && backgrounds.length > 0 ? (
        <div role="group" aria-label="Background" className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={backgroundId === null}
            onClick={() => setBackgroundId(null)}
            className={`grid h-14 w-20 shrink-0 place-items-center rounded-lg border bg-[#f4f4f2] text-xs text-muted-foreground transition-shadow ${backgroundId === null ? "ring-2 ring-[var(--ink)]" : "hover:ring-2 hover:ring-border"}`}
          >
            None
          </button>
          {backgrounds.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={backgroundId === b.id}
              title={b.name}
              onClick={() => setBackgroundId(b.id)}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border transition-shadow ${backgroundId === b.id ? "ring-2 ring-[var(--ink)]" : "hover:ring-2 hover:ring-border"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public route, cached by URL */}
              <img src={`/api/portal/backgrounds/${b.id}`} alt={b.name} loading="lazy" className="absolute inset-0 size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The picture of a Sample that has no icon yet: a soft tile with a line drawing of a box. */
export function SamplePlaceholder() {
  return (
    <svg viewBox="0 0 64 64" className="size-full" role="img" aria-label="No preview picture yet">
      <defs>
        <linearGradient id="sample-ph-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset="1" stopColor="#e4e8ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill="url(#sample-ph-bg)" />
      <g fill="none" stroke="#9aa3b2" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M32 15 47 23.5v17L32 49 17 40.5v-17z" fill="#ffffff" fillOpacity="0.7" />
        <path d="M17 23.5 32 32l15-8.5M32 32v17" />
      </g>
      <ellipse cx="32" cy="53" rx="14" ry="2.5" fill="#9aa3b2" fillOpacity="0.2" />
    </svg>
  );
}
