"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Video } from "lucide-react";
import { CAMERA_VIEWS, viewIconFaces, type CameraViewPreset } from "@/lib/camera-views";
import { STANDARD_VIEW } from "@/lib/view-settings";
import type { CartonViewHandle } from "./carton-view";
import { stripFrame, stripItem, useCanvasBottom, useStrip } from "./strip";

/**
 * Keyboard shortcuts for the camera views (`CameraViewPreset.keys`: F, T, L, R, B and the two-letter FL, FR, TL, TR, Bo).
 * They work anywhere on the page unless the person is typing (an input, a text area, a select, an editable text) or holds Ctrl / Cmd / Alt.
 * F, T and B are also the first letter of a two-letter shortcut, so the single view is shown at once and, if the second letter comes within
 * the next 0.6 s, the camera moves on to the two-letter view. With several 3D views on the page, the one under the mouse takes the key,
 * else the biggest one on the screen.
 */
const SEQUENCE_MS = 600;
interface KeyTarget {
  el: () => HTMLElement | null;
  go: (v: CameraViewPreset) => void;
}
const keyTargets = new Set<KeyTarget>();
const pointer = { x: -1, y: -1 };
let sequence: { key: string; at: number } | null = null;

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox'], [role='searchbox'], [role='spinbutton']")) return true;
  return false;
}

/** Which 3D view takes the key: under the mouse, else the largest one that is on screen (and not behind an open dialog). */
function pickTarget(): KeyTarget | null {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"], dialog[open]');
  let best: { t: KeyTarget; score: number } | null = null;
  for (const t of keyTargets) {
    const el = t.el();
    if (!el || el.closest("[inert], [aria-hidden='true']")) continue;
    if (dialog && !dialog.contains(el)) continue;
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (w <= 0 || h <= 0) continue;
    const under = pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    const score = (under ? 1e12 : 0) + w * h;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t ?? null;
}

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  const k = e.key.toLowerCase();
  if (k.length !== 1 || !"ftlrbo".includes(k)) return;
  const prev = sequence && e.timeStamp - sequence.at < SEQUENCE_MS ? sequence.key : null;
  const combo = prev ? CAMERA_VIEWS.find((v) => v.keys.toLowerCase() === prev + k) : undefined;
  const view = combo ?? CAMERA_VIEWS.find((v) => v.keys.toLowerCase() === k);
  if (!view) { sequence = null; return; }
  const target = pickTarget();
  if (!target) return;
  e.preventDefault();
  target.go(view);
  sequence = combo ? null : { key: k, at: e.timeStamp };
}
const onPointer = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; };

function addKeyTarget(t: KeyTarget): () => void {
  if (keyTargets.size === 0) {
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onPointer, { passive: true });
  }
  keyTargets.add(t);
  return () => {
    keyTargets.delete(t);
    if (keyTargets.size === 0) {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
    }
  };
}

/** Turn the keyboard shortcuts on for a 3D view: `el` is the view's frame (used to find the one under the mouse), `go` moves its camera. */
export function useCameraViewKeys(el: () => HTMLElement | null, go: (v: CameraViewPreset) => void) {
  const goRef = useRef(go);
  const elRef = useRef(el);
  useEffect(() => { goRef.current = go; elRef.current = el; });
  useEffect(() => addKeyTarget({ el: () => elRef.current(), go: (v) => goRef.current(v) }), []);
}

/** A tiny box drawn as seen from a view (the faces are computed from the same angles the camera gets). */
export function CameraViewIcon({ view, className = "size-6" }: { view: CameraViewPreset; className?: string }) {
  if (view.letter) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.1}>
        <rect x="4" y="4" width="16" height="16" rx="2.5" fill="currentColor" fillOpacity={0.14} />
        <text x="12" y="16.2" textAnchor="middle" fontSize={view.letter.length > 1 ? 9 : 11.5} fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">{view.letter}</text>
      </svg>
    );
  }
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
export function CameraViewTool({ viewRef, onPick, glide = true }: { viewRef: RefObject<CartonViewHandle | null>; /** Called with the view picked (for a page that keeps the camera in its own settings). */ onPick?: (v: CameraViewPreset) => void; /** false: the page moves the camera itself (from `onPick`); the tool only reports the pick. */ glide?: boolean }) {
  const { box, open, shown, toggle } = useStrip(CAMERA_VIEWS.length);
  const [current, setCurrent] = useState<string | null>(null);
  const bottom = useCanvasBottom(box);

  const go = (v: CameraViewPreset) => {
    setCurrent(v.id);
    onPick?.(v);
    const h = viewRef.current;
    if (!h || !glide) return;
    h.setViewSmooth({ ...STANDARD_VIEW, azimuthDeg: v.azimuthDeg, elevationDeg: v.elevationDeg, progress: h.getView()?.progress ?? 1 });
  };

  useCameraViewKeys(() => box.current?.parentElement ?? null, go);

  return (
    <div ref={box}>
      <button
        type="button"
        aria-label="Camera view"
        aria-expanded={open}
        data-tip="Camera: (keys F, T, L, R, B, FL, FR, TL, TR, BO)"
        onClick={() => toggle(!open)}
        style={{ bottom }}
        className={`absolute left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${open ? "bg-black text-white" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
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
                aria-keyshortcuts={v.keys}
                aria-pressed={current === v.id}
                data-tip={`${v.label}(${v.keys})`}
                style={m.style}
                onClick={() => go(v)}
                className={`${m.className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${current === v.id ? "bg-black text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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
