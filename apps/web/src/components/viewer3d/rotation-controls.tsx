"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronUp, Rotate3d } from "lucide-react";
import type { CartonViewHandle, Rotation } from "./carton-view";

/** Small borderless field to type an angle. Commits on Enter or when leaving the field; Esc puts the old value back. */
function AngleInput({ value, min, max, label, onCommit }: { value: number; min: number; max: number; label: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value));
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseFloat(draft.replace(",", ".").replace("\u2212", "-"));
    setDraft(null);
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n))));
  };
  return (
    <span className="flex w-11 shrink-0 items-center justify-end tabular-nums">
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} in degrees`}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number.parseFloat(shown);
            const n = (Number.isFinite(base) ? base : value) + (e.key === "ArrowUp" ? 1 : -1);
            setDraft(null);
            onCommit(Math.min(max, Math.max(min, Math.round(n))));
          }
        }}
        className="w-8 rounded-sm border-0 bg-transparent p-0 text-right text-[11px] text-muted-foreground outline-none hover:bg-muted/60 focus:bg-muted focus:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span aria-hidden className="text-muted-foreground">°</span>
    </span>
  );
}

/**
 * Three small sliders in the top right corner of a 3D view, folded into one icon button until the user opens them: X tilts the box up/down, Y turns it left/right, Z rolls the view sideways.
 * They follow the camera when it is dragged with the mouse, and move it when dragged.
 * The parent must be `relative` (the sliders are positioned against it).
 */
export function RotationControls({ viewRef, className = "" }: { viewRef: RefObject<CartonViewHandle | null>; className?: string }) {
  const [rot, setRot] = useState<Rotation>({ x: 0, y: 0, z: 0 });
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

  const apply = (axis: "x" | "y" | "z", v: number) => {
    setRot((r) => ({ ...r, [axis]: v }));
    viewRef.current?.setRotation({ [axis]: v });
  };

  const slider = (axis: "x" | "y" | "z", hint: string, min: number, max: number) => (
    <div className="flex items-center gap-1.5" title={hint}>
      <span aria-hidden className="w-3 shrink-0 font-medium">{axis.toUpperCase()}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.round(rot[axis])}
        aria-label={`Rotate ${axis.toUpperCase()}: ${hint}`}
        className="h-4 w-24 min-w-0"
        onChange={(e) => apply(axis, Number(e.target.value))}
      />
      <AngleInput value={rot[axis]} min={min} max={max} label={`Rotate ${axis.toUpperCase()}`} onCommit={(v) => apply(axis, v)} />
    </div>
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
        {slider("z", "roll the view sideways, like tilting your head", -180, 180)}
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
