"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { PortalScene } from "@/server/portal";

const Scene3D = dynamic(() => import("./scene-3d").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D view…</div>,
});

/**
 * The picture on a shared template page: the box in 3D. The dieline view is hidden from customers.
 * `scene` is null when the template cannot be shown in 3D; the flat picture is the only thing to show then.
 */
export function TemplatePreview({ userHash, name, thumbnail, scene }: { userHash: string; name: string; thumbnail: string | null; scene: PortalScene | null }) {
  // Whether the dieline folds is only known once the box is built; a flat one says so.
  const [foldable, setFoldable] = useState(true);
  return (
    <div className="flex flex-col gap-3">
      <div className="paper-grid sheet marks relative aspect-[4/3] overflow-hidden">
        {scene ? (
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
