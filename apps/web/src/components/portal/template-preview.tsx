"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Box, Layers } from "lucide-react";
import type { PortalScene } from "@/server/portal";

const Scene3D = dynamic(() => import("./scene-3d").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D view…</div>,
});

type Mode = "dieline" | "3d";

/**
 * The picture on a shared template page: the dieline, or the box in 3D (one at a time, the customer picks).
 * `scene` is null when the template cannot be shown in 3D, and then only the dieline is offered.
 */
export function TemplatePreview({ userHash, name, thumbnail, scene }: { userHash: string; name: string; thumbnail: string | null; scene: PortalScene | null }) {
  const [mode, setMode] = useState<Mode>("dieline");
  // Whether the dieline folds is only known once the box is built, so the 3D button stays and a flat one says so.
  const [foldable, setFoldable] = useState(true);
  const show3d = scene !== null && mode === "3d";
  return (
    <div className="flex flex-col gap-3">
      {scene ? (
        <div role="tablist" aria-label="Preview" className="sheet flex w-fit gap-1 rounded-xl p-1">
          <button type="button" role="tab" aria-selected={mode === "dieline"} onClick={() => setMode("dieline")} className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors ${mode === "dieline" ? "bg-[var(--ink)] text-white" : "text-muted-foreground hover:text-foreground"}`}>
            <Layers className="size-4" aria-hidden /> Dieline
          </button>
          <button type="button" role="tab" aria-selected={mode === "3d"} onClick={() => setMode("3d")} className={`flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors ${mode === "3d" ? "bg-[var(--ink)] text-white" : "text-muted-foreground hover:text-foreground"}`}>
            <Box className="size-4" aria-hidden /> 3D view
          </button>
        </div>
      ) : null}
      <div className="paper-grid sheet marks relative aspect-[4/3] overflow-hidden">
        {show3d ? (
          <Scene3D userHash={userHash} scene={scene} onFoldable={setFoldable} foldable={foldable} />
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
    </div>
  );
}
