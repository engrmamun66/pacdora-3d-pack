"use client";

import { useEffect, useState, type RefObject } from "react";
import { Eye, EyeOff, SlidersHorizontal, Sun } from "lucide-react";
import { DEFAULT_SHADOW, type CartonViewHandle, type ShadowSettings } from "./carton-view";
import { stripFrame, stripItem, useCanvasBottom, useStrip } from "./strip";

type ShadowPreset = Pick<ShadowSettings, "azimuthDeg" | "elevationDeg"> & { id: string; label: string };

const shadowPresets: readonly ShadowPreset[] = [
  { id: "front-right", label: "Light from front right", azimuthDeg: 39, elevationDeg: 51 },
  { id: "right", label: "Light from the right", azimuthDeg: 90, elevationDeg: 51 },
  { id: "back-left", label: "Light from back left", azimuthDeg: -141, elevationDeg: 51 },
  { id: "low", label: "Low light (long shadow)", azimuthDeg: 39, elevationDeg: 25 },
];

/**
 * A preset's icon: the floor seen from above (the front of the box at the bottom, like the dial in the light panel).
 * The sun, with rays, sits on the ring where the light comes from, and a band of shadow runs away from the box on the other side;
 * a lower sun makes a longer shadow. So the direction can be read at a glance.
 */
function LightIcon({ azimuthDeg, elevationDeg }: Pick<ShadowSettings, "azimuthDeg" | "elevationDeg">) {
  const a = (azimuthDeg * Math.PI) / 180;
  const [sx, sy] = [Math.sin(a), Math.cos(a)]; // towards the sun
  const [dx, dy] = [-sx, -sy]; // the way the shadow falls
  const reach = 3 + Math.min(9, Math.max(3, 4.5 / Math.tan((elevationDeg * Math.PI) / 180)));
  const [px, py] = [-dy * 3, dx * 3];
  const band = `${px},${py} ${dx * reach + px},${dy * reach + py} ${dx * reach - px},${dy * reach - py} ${-px},${-py}`;
  const [cx, cy] = [sx * 9, sy * 9];
  const rays = Array.from({ length: 8 }, (_, i) => {
    const r = (i * Math.PI) / 4;
    return <line key={i} x1={cx + Math.cos(r) * 3.6} y1={cy + Math.sin(r) * 3.6} x2={cx + Math.cos(r) * 5.2} y2={cy + Math.sin(r) * 5.2} />;
  });
  return (
    <svg aria-hidden viewBox="-14.5 -14.5 29 29" className="size-6" fill="currentColor" stroke="none">
      <circle r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
      <polygon points={band} fillOpacity="0.5" />
      <rect x="-3" y="-3" width="6" height="6" rx="1" />
      <circle cx={cx} cy={cy} r="2.4" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        {rays}
      </g>
    </svg>
  );
}

const sameAngle = (a: ShadowSettings, b: ShadowPreset) => a.azimuthDeg === b.azimuthDeg && a.elevationDeg === b.elevationDeg;

/** Shadow tool above the camera-view button. Its controls use the same sequential strip motion as camera quick views. */
export function ShadowTool({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  const { box, open, shown, toggle } = useStrip(shadowPresets.length + 2);
  const [shadow, setShadow] = useState<ShadowSettings>({ on: true, ...DEFAULT_SHADOW });
  const [custom, setCustom] = useState(false);
  const canvasBottom = useCanvasBottom(box);
  const bottom = canvasBottom + 40;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const current = viewRef.current?.getShadow();
      if (current) setShadow(current);
    });
    return () => cancelAnimationFrame(id);
  }, [viewRef]);

  const update = (patch: Partial<ShadowSettings>) => {
    const view = viewRef.current;
    if (!view) return;
    view.setShadow(patch);
    setShadow(view.getShadow());
  };

  return (
    <div ref={box}>
      <button
        type="button"
        aria-label="Shadow controls"
        aria-expanded={open}
        title="Shadow controls"
        onClick={() => toggle(!open)}
        style={{ bottom }}
        className={`absolute left-2 z-10 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${open ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground hover:text-foreground"}`}
      >
        <Sun className="size-4" aria-hidden />
      </button>
      {shown ? (
        <div role="group" aria-label="Shadow controls" aria-hidden={!open} inert={!open} style={{ bottom }} className={stripFrame(open)}>
          <button
            type="button"
            aria-label={shadow.on ? "Hide shadow" : "Show shadow"}
            aria-pressed={shadow.on}
            title={shadow.on ? "Hide shadow" : "Show shadow"}
            style={stripItem(open, 0, shadowPresets.length + 2).style}
            onClick={() => update({ on: !shadow.on })}
            className={`${stripItem(open, 0, shadowPresets.length + 2).className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${shadow.on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {shadow.on ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          </button>
          {shadowPresets.map((preset, index) => {
            const active = sameAngle(shadow, preset);
            const motion = stripItem(open, index + 1, shadowPresets.length + 2);
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                aria-pressed={active}
                title={preset.label}
                style={motion.style}
                onClick={() => update({ on: true, azimuthDeg: preset.azimuthDeg, elevationDeg: preset.elevationDeg })}
                className={`${motion.className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <LightIcon azimuthDeg={preset.azimuthDeg} elevationDeg={preset.elevationDeg} />
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Set the light by hand"
            aria-pressed={custom}
            aria-expanded={custom}
            title="Set the light by hand (angle, height, darkness, softness)"
            style={stripItem(open, shadowPresets.length + 1, shadowPresets.length + 2).style}
            onClick={() => setCustom((v) => !v)}
            className={`${stripItem(open, shadowPresets.length + 1, shadowPresets.length + 2).className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${custom ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {open && custom ? <GlobalLightPanel shadow={shadow} bottom={bottom + 40} onChange={update} /> : null}
    </div>
  );
}

const round = (n: number) => Math.round(n);

/**
 * Photoshop-style "Global light": the angle the light comes from (a dial you drag, or type), its height, and how dark and how soft the shadow is.
 * The dial is the floor seen from above, the box in the middle and the front of the box at the bottom.
 */
function GlobalLightPanel({ shadow, bottom, onChange }: { shadow: ShadowSettings; bottom: number; onChange: (patch: Partial<ShadowSettings>) => void }) {
  const R = 20;
  const az = (shadow.azimuthDeg * Math.PI) / 180;
  const dial = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 2) return;
    onChange({ on: true, azimuthDeg: round((Math.atan2(dx, dy) * 180) / Math.PI) });
  };
  const rows: { key: "elevationDeg" | "strength" | "softness"; label: string; min: number; max: number; unit: string; scale: number }[] = [
    { key: "elevationDeg", label: "Height", min: 5, max: 88, unit: "°", scale: 1 },
    { key: "strength", label: "Darkness", min: 0, max: 100, unit: "%", scale: 100 },
    { key: "softness", label: "Softness", min: 0, max: 100, unit: "%", scale: 100 },
  ];
  return (
    <div role="group" aria-label="Global light" style={{ bottom }} className="absolute left-12 z-20 w-64 rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Global light</span>
        <button type="button" className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onChange({ on: true, ...DEFAULT_SHADOW })}>
          Reset
        </button>
      </div>
      <div className="mb-2 flex items-center gap-3">
        <div
          role="slider"
          aria-label="Light angle"
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={round(shadow.azimuthDeg)}
          tabIndex={0}
          title="Drag to turn the light around the box"
          className="relative size-12 shrink-0 cursor-pointer touch-none rounded-full border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dial(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) dial(e);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 15 : 5;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange({ azimuthDeg: shadow.azimuthDeg + step });
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange({ azimuthDeg: shadow.azimuthDeg - step });
            else return;
            e.preventDefault();
          }}
        >
          <span aria-hidden className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border bg-background" />
          <svg aria-hidden viewBox="-24 -24 48 48" className="pointer-events-none absolute inset-0 size-full">
            <line x1="0" y1="0" x2={Math.sin(az) * R} y2={Math.cos(az) * R} stroke="currentColor" strokeWidth="1.5" className="text-primary" />
            <circle cx={Math.sin(az) * R} cy={Math.cos(az) * R} r="3.5" className="fill-primary" />
          </svg>
        </div>
        <label className="flex flex-1 items-center justify-between gap-2">
          <span className="text-muted-foreground">Angle</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={-180}
              max={180}
              value={round(shadow.azimuthDeg)}
              aria-label="Light angle in degrees"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChange({ on: true, azimuthDeg: v });
              }}
              className="h-7 w-16 rounded-md border bg-background px-1.5 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            °
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const value = round(shadow[row.key] * (row.key === "elevationDeg" ? 1 : row.scale));
          const set = (v: number) => onChange({ on: true, [row.key]: row.key === "elevationDeg" ? v : v / row.scale });
          return (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-muted-foreground">{row.label}</span>
              <input type="range" min={row.min} max={row.max} value={value} aria-label={row.label} onChange={(e) => set(Number(e.target.value))} className="min-w-0 flex-1 accent-primary" />
              <span className="w-9 shrink-0 text-right tabular-nums">
                {value}
                {row.unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
