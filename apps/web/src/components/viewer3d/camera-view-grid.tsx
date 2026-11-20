"use client";

import { CAMERA_VIEWS, type CameraViewPreset } from "@/lib/camera-views";
import { useRef } from "react";
import { CameraViewIcon, useCameraViewKeys } from "./camera-view-menu";

const sameTurn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180) < 1.5;

/**
 * The quick camera views as a grid of bigger icons, always visible (for a page whose 3D view is for setting up the camera: the Template
 * Layouts page). The view that matches the camera now is marked. A pick is reported; the page moves the camera.
 */
export function CameraViewGrid({ azimuthDeg, elevationDeg, onPick }: { azimuthDeg: number; elevationDeg: number; onPick: (v: CameraViewPreset) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The page's 3D view sits right above this grid, so the keys use the grid's parent as the view's frame.
  useCameraViewKeys(() => box.current?.parentElement ?? null, onPick);
  return (
    <div ref={box} role="group" aria-label="Camera views" className="grid grid-cols-5 gap-1.5 border-t bg-background px-3 py-2">
      {CAMERA_VIEWS.map((v) => {
        const on = sameTurn(azimuthDeg, v.azimuthDeg) && Math.abs(elevationDeg - v.elevationDeg) < 1.5;
        return (
          <button
            key={v.id}
            type="button"
            aria-label={v.label}
            aria-keyshortcuts={v.keys}
            aria-pressed={on}
            title={`${v.label}(${v.keys})`}
            onClick={() => onPick(v)}
            className={`grid h-9 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-foreground bg-black text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <CameraViewIcon view={v} className="size-6" />
          </button>
        );
      })}
    </div>
  );
}
