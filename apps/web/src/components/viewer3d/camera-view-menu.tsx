"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Video } from "lucide-react";
import { CAMERA_VIEWS, viewIconFaces, type CameraViewPreset } from "@/lib/camera-views";
import { STANDARD_VIEW } from "@/lib/view-settings";
import type { CartonViewHandle } from "./carton-view";

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
 * Tool of a 3D view (third icon in its top left column): opens a strip of quick views over the top of the view.
 * Picking one turns the box there at once, back at the standard zoom and position; the fold stays as it is.
 * The parent must be `relative`.
 */
export function CameraViewTool({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  const go = (v: CameraViewPreset) => {
    const h = viewRef.current;
    if (!h) return;
    setCurrent(v.id);
    h.setView({ ...STANDARD_VIEW, azimuthDeg: v.azimuthDeg, elevationDeg: v.elevationDeg, progress: h.getView()?.progress ?? 1 });
  };

  return (
    <div ref={box}>
      <button
        type="button"
        aria-label="Camera view"
        aria-expanded={open}
        title="Camera view: quick angles"
        onClick={() => setOpen((o) => !o)}
        className={`absolute top-[5.5rem] left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${open ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
      >
        <Video className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="group" aria-label="Camera views" className="absolute top-2 right-12 left-12 z-20 flex gap-1.5 overflow-x-auto rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          {CAMERA_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={current === v.id}
              onClick={() => go(v)}
              className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${current === v.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <CameraViewIcon view={v} />
              <span className="whitespace-nowrap">{v.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
