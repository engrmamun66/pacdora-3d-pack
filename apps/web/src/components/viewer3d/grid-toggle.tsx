"use client";

import { useEffect, useState, type RefObject } from "react";
import { Grid3x3 } from "lucide-react";
import type { CartonViewHandle } from "./carton-view";

/**
 * Icon button in the top left corner of a 3D view: shows or hides a floor grid behind the carton.
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
  );
}
