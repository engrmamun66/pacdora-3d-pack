"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronUp, Rotate3d } from "lucide-react";
import type { CartonViewHandle } from "./carton-view";

/**
 * Two small sliders in the top right corner of a 3D view, folded into one icon button until the user opens them: X tilts the box up/down, Y turns it left/right.
 * They follow the camera when it is dragged with the mouse, and move it when dragged.
 * The parent must be `relative` (the sliders are positioned against it).
 */
export function RotationControls({ viewRef, className = "" }: { viewRef: RefObject<CartonViewHandle | null>; className?: string }) {
  const [rot, setRot] = useState({ x: 0, y: 0 });
  // Folded away until the user asks for the sliders.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = viewRef.current;
    if (!h) return;
    const stop = h.onRotation(setRot);
    // The camera is placed a moment after the view is created, so read it once the frame has been drawn.
    const id = requestAnimationFrame(() => {
      const r = h.getRotation();
      if (r) setRot(r);
    });
    return () => {
      stop();
      cancelAnimationFrame(id);
    };
  }, [viewRef]);

  const slider = (axis: "x" | "y", hint: string, min: number, max: number) => (
    <label className="flex items-center gap-1.5" title={hint}>
      <span className="w-3 shrink-0 font-medium">{axis.toUpperCase()}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.round(rot[axis])}
        aria-label={`Rotate ${axis.toUpperCase()}: ${hint}`}
        className="h-4 w-24 min-w-0"
        onChange={(e) => {
          const v = Number(e.target.value);
          setRot((r) => ({ ...r, [axis]: v }));
          viewRef.current?.setRotation({ [axis]: v });
        }}
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{Math.round(rot[axis])}°</span>
    </label>
  );

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Show rotation controls"
        aria-expanded={false}
        title="Rotate X / Y"
        onClick={() => setOpen(true)}
        className={`absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-lg border bg-background/80 text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`}
      >
        <Rotate3d className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <div role="group" aria-label="Rotate the 3D view" className={`absolute top-2 right-2 z-10 flex items-start gap-1 rounded-lg border bg-background/80 py-1.5 pr-1 pl-2 text-[11px] shadow-xs backdrop-blur ${className}`}>
      <div className="flex flex-col gap-0.5">
        {slider("x", "tilt the box up or down", -89, 89)}
        {slider("y", "turn the box left or right", -180, 180)}
      </div>
      <button
        type="button"
        aria-label="Hide rotation controls"
        aria-expanded
        title="Hide"
        onClick={() => setOpen(false)}
        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronUp className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
