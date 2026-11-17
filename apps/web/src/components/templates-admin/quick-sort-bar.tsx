"use client";

import { InfoTip } from "./help-tip";
import { useRef, useState } from "react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_H = 150;

export interface QuickItem {
  id: string;
  label: string;
  /** The step the line was given; lines with the same step fold together. */
  step: number;
}

/**
 * Quick sort bar, stuck to the bottom of the window while the fold editor is on screen.
 * The fold lines the admin clicked are shown in groups, one group per step. Step 1 is open at first, and "Add step" opens
 * the next one: the lines clicked from then on join it. Lines of one step fold together. Drag a chip into another step
 * (or focus it and press Alt + left or right arrow), press x to drop it, Apply to use it.
 */
export function QuickSortBar({
  items,
  step,
  preview,
  onPreviewChange,
  onAddStep,
  onSetStep,
  onRemoveStep,
  onRemove,
  onClear,
  onApply,
  onCancel,
  bottom,
}: {
  items: QuickItem[];
  /** The step the next clicked line joins. */
  step: number;
  /** Whether the 3D box folds in the order being sorted. */
  preview: boolean;
  onPreviewChange: (on: boolean) => void;
  onAddStep: () => void;
  /** Give a line this step. */
  onSetStep: (id: string, step: number) => void;
  /** Drop a whole step with its lines; the steps after it move up one. */
  onRemoveStep: (step: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
  /** Distance from the window bottom (CSS length), so the bar clears a sticky save bar. */
  bottom: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStep, setOverStep] = useState<number | null>(null);
  // Height of the bar. The grip at the top centre makes it taller (as tall as the window allows) so more steps show at once.
  const [height, setHeight] = useState(MIN_H);
  const grip = useRef<{ y: number; h: number } | null>(null);
  const maxH = () => Math.max(MIN_H, window.innerHeight - 80);
  const resize = (h: number) => setHeight(Math.min(maxH(), Math.max(MIN_H, Math.round(h))));

  // One group per step in use, in order; the open step is always shown, even while it is still empty.
  const stepNumbers = [...new Set([...items.map((i) => i.step), step])].sort((a, b) => a - b);
  const groups = stepNumbers.map((n) => ({ step: n, items: items.filter((i) => i.step === n) }));
  const usedSteps = groups.filter((g) => g.items.length).length;
  const idle = items.length === 0 && step === 1;

  return (
    <section
      aria-label="Quick sort"
      style={{ bottom, height }}
      className="sticky z-20 flex flex-col gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-lg ring-1 ring-black/5"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the quick sort bar"
        aria-valuemin={MIN_H}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag up or down to resize. Double-click to reset."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          grip.current = { y: e.clientY, h: height };
        }}
        onPointerMove={(e) => grip.current && resize(grip.current.h + (grip.current.y - e.clientY))}
        onPointerUp={() => (grip.current = null)}
        onPointerCancel={() => (grip.current = null)}
        onDoubleClick={() => setHeight(MIN_H)}
        onKeyDown={(e) => {
          const next = e.key === "ArrowUp" ? height + 24 : e.key === "ArrowDown" ? height - 24 : e.key === "Home" ? MIN_H : null;
          if (next === null) return;
          e.preventDefault();
          resize(next);
        }}
        className="group absolute -top-3 left-1/2 flex h-6 w-20 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span aria-hidden className="h-1.5 w-12 rounded-full border bg-muted shadow-xs transition-colors group-hover:bg-primary/30 group-focus-visible:bg-primary/30" />
      </div>

      {/* Top row: what this is, what the next click does, and the buttons. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">Quick sort</h3>
          <InfoTip label="Quick sort">Click the fold lines on the picture. They join step {step}, which is open now. Press Add step to open the next one. Lines with the same step fold together. Drag a chip into another step to move it.</InfoTip>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {items.length === 0 ? "Click a fold line to add it" : `${items.length} ${items.length === 1 ? "line" : "lines"} in ${usedSteps} ${usedSteps === 1 ? "step" : "steps"}`}
        </p>
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={preview} onChange={(e) => onPreviewChange(e.target.checked)} className="size-4 accent-foreground" />
          Preview 3D folding
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="dark" size="sm" onClick={onAddStep} title={`Open step ${step + 1}: the lines you click next join it`}>
            <Plus className="size-4" aria-hidden /> Add step
          </Button>
          <Button type="button" variant="dark" size="sm" disabled={idle} onClick={onClear} title="Remove every line and step"><Trash2 className="size-4" aria-hidden /> Clear</Button>
          <Button type="button" variant="dark" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="dark" size="sm" disabled={!items.length} onClick={onApply}>Apply</Button>
        </div>
      </div>

      {/* The steps, one group each. */}
      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-0.5" aria-label="Fold steps, in order. Lines of one step fold together.">
        {groups.map((g) => {
          const open = g.step === step;
          const target = dragId !== null && overStep === g.step;
          return (
            <li
              key={g.step}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  setOverStep(g.step);
                }
              }}
              onDragLeave={() => setOverStep((s) => (s === g.step ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) onSetStep(dragId, g.step);
                setDragId(null);
                setOverStep(null);
              }}
              className={`flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border py-1.5 pr-2 pl-1.5 transition-colors ${open ? "border-primary/50 bg-primary/5" : "bg-muted/30"} ${target ? "border-primary bg-primary/10 ring-2 ring-primary/30" : ""}`}
            >
              <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums ${open ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground"}`}>Step {g.step}</span>
              {g.items.length === 0 ? <span className="px-1 text-xs text-muted-foreground">Click fold lines to add them here</span> : null}
              {g.items.map((it) => (
                <div
                  key={it.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(it.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", it.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStep(null);
                  }}
                  className={`flex shrink-0 cursor-grab items-center gap-1 rounded-lg border bg-background py-1 pr-1 pl-1 text-sm shadow-xs transition-opacity active:cursor-grabbing ${dragId === it.id ? "opacity-40" : ""}`}
                >
                  <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    className="max-w-44 truncate rounded px-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    title={it.label}
                    aria-label={`Step ${it.step}: ${it.label}. Alt plus left or right arrow moves it to another step.`}
                    onKeyDown={(e) => {
                      if (!e.altKey) return;
                      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        if (it.step > 1) onSetStep(it.id, it.step - 1);
                      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        onSetStep(it.id, it.step + 1);
                      }
                    }}
                  >
                    {it.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${it.label}`}
                    onClick={() => onRemove(it.id)}
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
              {groups.length > 1 || g.items.length > 0 ? (
                <button
                  type="button"
                  aria-label={`Remove step ${g.step}${g.items.length ? " and its lines" : ""}`}
                  title={g.items.length ? `Remove step ${g.step} and its lines` : `Remove step ${g.step}`}
                  onClick={() => onRemoveStep(g.step)}
                  className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
