"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { PortalScene } from "@/server/portal";
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
  const layout = layouts.find((l) => l.id === layoutId) ?? null;
  const background = backgrounds.find((b) => b.id === backgroundId) ?? null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {scene && layouts.length > 0 ? (
        <div role="tablist" aria-label="Sample layouts" aria-orientation="vertical" className="sheet flex w-full shrink-0 gap-1 self-start overflow-x-auto rounded-xl p-1 sm:w-28 sm:flex-col sm:overflow-visible">
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
                className={`flex shrink-0 flex-col gap-1 rounded-lg px-1.5 py-1.5 text-left text-sm font-medium whitespace-nowrap transition-colors ${l.iconUrl ? "w-20 sm:w-full" : "h-9 justify-center px-3"} ${on ? "bg-[var(--ink)] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {l.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the layout's icon, a small PNG
                  <img src={l.iconUrl} alt="" className={`aspect-square w-full rounded-md object-cover ${on ? "ring-1 ring-white/40" : "border"}`} />
                ) : null}
                <span className={l.iconUrl ? "px-1" : ""}>Sample {i + 1}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="paper-grid sheet marks relative aspect-[4/3] overflow-hidden">
          {scene ? (
            <Scene3D userHash={userHash} scene={scene} onFoldable={setFoldable} foldable={foldable} layout={layout?.spec ?? null} backgroundUrl={background ? `/api/portal/backgrounds/${background.id}` : null} />
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
    </div>
  );
}
