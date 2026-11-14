"use client";

import { useState, type RefObject } from "react";
import { Video } from "lucide-react";
import { CAMERA_VIEWS, viewIconFaces, type CameraViewPreset } from "@/lib/camera-views";
import { STANDARD_VIEW } from "@/lib/view-settings";
import type { CartonViewHandle } from "./carton-view";
import { stripFrame, stripItem, useCanvasBottom, useStrip } from "./strip";

/** A tiny box drawn as seen from a view (the faces are computed from the same angles the camera gets). */
export function CameraViewIcon({ view, className = "size-6" }: { view: CameraViewPreset; className?: string }) {
  const shade = { front: 0.38, top: 0.14, side: 0.24 } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinejoin="round">
      {viewIconFaces(view.azimuthDeg, view.elevationDeg).map((f, i) => (
        <polygon key={i} points={f.points} fill="currentColor" fillOpacity={shade[f.kind]} />
      ))}
    </svg>
  );
}

/**
 * Tool of a 3D view: a camera icon in the bottom left corner of the picture (above the view's own control bar, if it has one).
 * Clicking it expands a strip of quick views to the right of the icon: small box icons only, sliding in one by one and out again in reverse when closed (`strip.tsx`); the name shows as a tooltip (and for screen readers).
 * Picking one glides the camera there (about 0.6 s), back at the standard zoom and position; the fold stays as it is.
 * The parent must be `relative` and hold the 3D canvas.
 */
export function CameraViewTool({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  const { box, open, shown, toggle } = useStrip(CAMERA_VIEWS.length);
  const [current, setCurrent] = useState<string | null>(null);
  const bottom = useCanvasBottom(box);

  const go = (v: CameraViewPreset) => {
    const h = viewRef.current;
    if (!h) return;
    setCurrent(v.id);
    h.setViewSmooth({ ...STANDARD_VIEW, azimuthDeg: v.azimuthDeg, elevationDeg: v.elevationDeg, progress: h.getView()?.progress ?? 1 });
  };

  return (
    <div ref={box}>
      <button
        type="button"
        aria-label="Camera view"
        aria-expanded={open}
        title="Camera view: quick angles"
        onClick={() => toggle(!open)}
        style={{ bottom }}
        className={`absolute left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${open ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
      >
        <Video className="size-4" aria-hidden />
      </button>
      {shown ? (
        <div role="group" aria-label="Camera views" aria-hidden={!open} inert={!open} style={{ bottom }} className={stripFrame(open)}>
          {CAMERA_VIEWS.map((v, i) => {
            const m = stripItem(open, i, CAMERA_VIEWS.length);
            return (
              <button
                key={v.id}
                type="button"
                aria-label={v.label}
                aria-pressed={current === v.id}
                title={v.label}
                style={m.style}
                onClick={() => go(v)}
                className={`${m.className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${current === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <CameraViewIcon view={v} className="size-5" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
