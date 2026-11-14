"use client";

import { useEffect, useState, type RefObject } from "react";
import { Eye, EyeOff, Sun, SunDim, SunMedium } from "lucide-react";
import { DEFAULT_SHADOW, type CartonViewHandle, type ShadowSettings } from "./carton-view";
import { stripFrame, stripItem, useCanvasBottom, useStrip } from "./strip";

type ShadowPreset = Pick<ShadowSettings, "azimuthDeg" | "elevationDeg"> & { id: string; label: string; icon: typeof Sun };

const shadowPresets: readonly ShadowPreset[] = [
  { id: "front-right", label: "Light from front right", azimuthDeg: 39, elevationDeg: 51, icon: Sun },
  { id: "right", label: "Light from the right", azimuthDeg: 90, elevationDeg: 51, icon: SunMedium },
  { id: "back-left", label: "Light from back left", azimuthDeg: -141, elevationDeg: 51, icon: Sun },
  { id: "low", label: "Low light (long shadow)", azimuthDeg: 39, elevationDeg: 25, icon: SunDim },
];

const sameAngle = (a: ShadowSettings, b: ShadowPreset) => a.azimuthDeg === b.azimuthDeg && a.elevationDeg === b.elevationDeg;

/** Shadow tool above the camera-view button. Its controls use the same sequential strip motion as camera quick views. */
export function ShadowTool({ viewRef }: { viewRef: RefObject<CartonViewHandle | null> }) {
  const { box, open, shown, toggle } = useStrip(shadowPresets.length + 1);
  const [shadow, setShadow] = useState<ShadowSettings>({ on: true, ...DEFAULT_SHADOW });
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
            style={stripItem(open, 0, shadowPresets.length + 1).style}
            onClick={() => update({ on: !shadow.on })}
            className={`${stripItem(open, 0, shadowPresets.length + 1).className} grid size-7 shrink-0 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${shadow.on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {shadow.on ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          </button>
          {shadowPresets.map((preset, index) => {
            const Icon = preset.icon;
            const active = sameAngle(shadow, preset);
            const motion = stripItem(open, index + 1, shadowPresets.length + 1);
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
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
