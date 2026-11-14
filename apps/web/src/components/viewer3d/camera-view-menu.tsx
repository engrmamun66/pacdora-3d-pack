"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Video } from "lucide-react";
import { CAMERA_VIEWS, viewIconFaces, type CameraViewPreset } from "@/lib/camera-views";
import { STANDARD_VIEW } from "@/lib/view-settings";
import type { CartonViewHandle } from "./carton-view";

/** Closing plays the opening backwards: the icons slide away one by one (last first), then the frame closes. Keep in step with `cv-*` in globals.css. */
const CLOSE_MS = CAMERA_VIEWS.length * 40 + 360;

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
 * Clicking it expands a strip of quick views to the right of the icon: small box icons only, sliding in one by one and out again in reverse when closed (`cv-*` in globals.css, `CLOSE_MS` here); the name shows as a tooltip (and for screen readers).
 * Picking one glides the camera there (about 0.6 s), back at the standard zoom and position; the fold stays as it is.
 * The parent must be `relative` and hold the 3D canvas.
 */
export function CameraViewTool({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  // `open` is what the user wants; `shown` keeps the strip on screen while it plays its closing animation.
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const toggle = useCallback((next: boolean) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(next);
    if (next) setShown(true);
    else closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setShown(false); }, CLOSE_MS);
  }, []);
  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }, []);
  const [current, setCurrent] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Distance from the bottom of the parent to the bottom of the 3D canvas (a control bar under the picture is skipped).
  const [bottom, setBottom] = useState(8);
  useEffect(() => {
    // The canvas is added by the 3D view's own effect, which runs before this one (it comes first in the parent).
    const parent = box.current?.parentElement;
    const canvas = parent?.querySelector("canvas");
    if (!parent || !canvas) return;
    const measure = () => setBottom(Math.max(0, Math.round(parent.getBoundingClientRect().bottom - canvas.getBoundingClientRect().bottom)) + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) toggle(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      toggle(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, toggle]);

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
        <div role="group" aria-label="Camera views" aria-hidden={!open} inert={!open} style={{ bottom }} className={`${open ? "cv-strip" : "cv-strip-out"} absolute left-12 z-20 flex max-w-[calc(100%-3.5rem)] gap-0.5 overflow-x-auto rounded-lg border bg-background/95 p-0.5 shadow-lg backdrop-blur`}>
          {CAMERA_VIEWS.map((v, i) => (
            <button
              key={v.id}
              type="button"
              aria-label={v.label}
              aria-pressed={current === v.id}
              title={v.label}
              style={{ animationDelay: open ? `${80 + i * 55}ms` : `${(CAMERA_VIEWS.length - 1 - i) * 40}ms` }}
              onClick={() => go(v)}
              className={`${open ? "cv-item" : "cv-item-out"} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${current === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <CameraViewIcon view={v} className="size-5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
