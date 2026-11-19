"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Ruler } from "lucide-react";
import type { CartonViewHandle } from "./carton-view";
import { useCanvasBottom } from "./strip";

type Unit = "mm" | "in";

/**
 * Icon button in the bottom right corner of the 3D picture (above the view's control bar, if it has one): shows the sizes as arrows with the value in the
 * middle: of every part of the box (outside, and inside when the board has a thickness) and, with "Panels", of every panel. Pass `unit` to follow the page's unit; without it a small
 * mm | in switch appears beside the button while the sizes are shown. The parent must be `relative`.
 */
export function DimensionTool({ viewRef, unit }: { viewRef: RefObject<CartonViewHandle | null>; unit?: Unit | undefined }) {
  const [on, setOn] = useState(false);
  const [own, setOwn] = useState<Unit>("mm");
  const [showBox, setShowBox] = useState(true);
  const [panels, setPanels] = useState(false);
  const shownUnit = unit ?? own;
  // Sits at the bottom of the 3D picture itself, above the view's own control bar (Fold slider and so on) when it has one.
  const box = useRef<HTMLDivElement>(null);
  const bottom = useCanvasBottom(box);

  // Pick up a view that already shows the sizes (a longer-lived view).
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(viewRef.current?.getDimensions?.() != null));
    return () => cancelAnimationFrame(id);
  }, [viewRef]);

  // Keep the 3D view in step with the switch and the unit; the box may be built a moment after this mounts, so try again once.
  useEffect(() => {
    // `?.()`: a view that was built before this tool existed (a hot-reloaded page) has no such method until it is rebuilt.
    const apply = () => viewRef.current?.setDimensions?.(on ? { unit: shownUnit, box: showBox, panels } : null);
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [viewRef, on, shownUnit, showBox, panels]);

  const seg = (u: Unit) => `h-6 rounded-md px-2 text-[11px] font-medium transition-colors ${own === u ? "bg-black text-white" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <div ref={box} style={{ bottom }} className="absolute right-2 z-10 flex items-center gap-1.5">
      {on ? (
        <div role="group" aria-label="What sizes to show" className="flex items-center gap-2.5 rounded-lg border bg-background/90 px-2.5 py-1 shadow-xs backdrop-blur">
          <label data-tip="Sizes of each part of the box" className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
            <input type="checkbox" className="size-3.5 cursor-pointer accent-foreground" checked={showBox} onChange={() => setShowBox((v) => !v)} /> Box
          </label>
          <label data-tip="Width and height of every panel" className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
            <input type="checkbox" className="size-3.5 cursor-pointer accent-foreground" checked={panels} onChange={() => setPanels((v) => !v)} /> Panels
          </label>
        </div>
      ) : null}
      {on && unit === undefined ? (
        <div role="group" aria-label="Unit of the sizes" className="flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-xs backdrop-blur">
          <button type="button" aria-pressed={own === "mm"} className={seg("mm")} onClick={() => setOwn("mm")}>mm</button>
          <button type="button" aria-pressed={own === "in"} className={seg("in")} onClick={() => setOwn("in")}>in</button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={on ? "Hide the sizes" : "Show the sizes"}
        aria-pressed={on}
        data-tip={on ? "Hide sizes" : `Show the size of each part (${shownUnit})`}
        onClick={() => setOn((v) => !v)}
        className={`grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? "bg-black text-white" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
      >
        <Ruler className="size-4" aria-hidden />
      </button>
    </div>
  );
}
