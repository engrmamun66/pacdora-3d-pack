"use client";

import { useEffect, useState, type RefObject } from "react";
import { Grid3x3, Lock, LockOpen } from "lucide-react";
import type { CartonViewHandle } from "./carton-view";
import { CameraViewTool } from "./camera-view-menu";

/**
 * Icon button in the top left corner of a 3D view: shows or hides a floor grid behind the carton. Under it: keep the view. The camera views tool sits in the bottom left corner.
 * The parent must be `relative`. On from the start; pass `defaultOn={false}` to start with the grid hidden.
 */
export function GridToggle({ viewRef, defaultOn = true }: { viewRef: RefObject<CartonViewHandle | null>; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);

  // A view that was created earlier may already have its grid on; with `defaultOn` a view without one gets it now.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const view = viewRef.current;
      const shown = view?.isGridVisible() ?? false;
      if (defaultOn && view && !shown) view.setGridVisible(true);
      setOn(shown || (defaultOn && !!view));
    });
    return () => cancelAnimationFrame(id);
  }, [viewRef, defaultOn]);

  return (
    <>
    <button
      type="button"
      aria-label={on ? "Hide the grid" : "Show the grid"}
      aria-pressed={on}
      title={on ? "Hide grid" : "Show grid"}
      onClick={() => {
        const next = !on;
        setOn(next);
        viewRef.current?.setGridVisible(next);
      }}
      className={`absolute top-2 left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
    >
      <Grid3x3 className="size-4" aria-hidden />
    </button>
    <KeepViewToggle viewRef={viewRef} />
    <CameraViewTool viewRef={viewRef} />
    </>
  );
}

/**
 * Icon button under the grid button. When on, the camera (tilt x, turn y, roll z, zoom, position) stays where
 * it is while the 3D object is rebuilt, so an edit changes only the box, not your view.
 */
function KeepViewToggle({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  const [on, setOn] = useState(false);
  const [values, setValues] = useState<{ x: number; y: number; z: number } | null>(null);

  // Pick up a setting a longer-lived view already has, and follow the camera so the tooltip shows the numbers being kept.
  useEffect(() => {
    let off = () => {};
    const id = requestAnimationFrame(() => {
      const view = viewRef.current;
      if (!view) return;
      setOn(view.isKeepView());
      setValues(view.getRotation());
      off = view.onRotation((r) => setValues(r));
    });
    return () => {
      cancelAnimationFrame(id);
      off();
    };
  }, [viewRef]);

  const numbers = values ? `x ${Math.round(values.x)}°, y ${Math.round(values.y)}°, z ${Math.round(values.z)}°` : "";
  return (
    <button
      type="button"
      aria-label={on ? "Stop keeping the view" : "Keep the view when the model changes"}
      aria-pressed={on}
      title={on ? `Keeping this view (${numbers}). Click to let it reset.` : `Keep this view (${numbers}) when the model changes: only the 3D object updates`}
      onClick={() => {
        const next = !on;
        setOn(next);
        viewRef.current?.setKeepView(next);
      }}
      className={`absolute top-12 left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
    >
      {on ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
    </button>
  );
}
