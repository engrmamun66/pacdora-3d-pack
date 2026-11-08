"use client";

import { useEffect, useRef } from "react";
import type { Viewport } from "./editor-controller";

export const RULER_SIZE = 20;
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

/** Millimetre ruler aligned with the canvas viewport. */
export function Ruler({ orientation, viewport }: { orientation: "horizontal" | "vertical"; viewport: Viewport | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const draw = () => {
      if (!viewport) return;
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = size.current;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f6f6f4";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#b9b8b2";
      ctx.fillStyle = "#6b6b66";
      ctx.font = "9px system-ui, sans-serif";
      ctx.lineWidth = 1;
      const z = viewport.zoom;
      const step = STEPS.find((s) => s * z >= 50) ?? 5000;
      const minor = step / (step % 5 === 0 && step >= 5 ? 5 : 2);
      const horizontal = orientation === "horizontal";
      const length = horizontal ? w : h;
      const origin = horizontal ? viewport.x : viewport.y;
      const start = Math.floor(-origin / z / minor) * minor;
      const end = (length - origin) / z;
      ctx.beginPath();
      for (let mm = start; mm <= end; mm += minor) {
        const px = Math.round(origin + mm * z) + 0.5;
        const major = Math.abs(mm / step - Math.round(mm / step)) < 1e-6;
        const tick = major ? RULER_SIZE : RULER_SIZE * 0.3;
        if (horizontal) {
          ctx.moveTo(px, RULER_SIZE);
          ctx.lineTo(px, RULER_SIZE - tick);
          if (major) ctx.fillText(String(Math.round(mm)), px + 2, 9);
        } else {
          ctx.moveTo(RULER_SIZE, px);
          ctx.lineTo(RULER_SIZE - tick, px);
          if (major) {
            ctx.save();
            ctx.translate(9, px + 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(String(Math.round(mm)), 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
    };
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      size.current = { w: entry.contentRect.width, h: entry.contentRect.height };
      draw();
    });
    ro.observe(el);
    draw();
    return () => ro.disconnect();
  }, [orientation, viewport]);

  return <canvas ref={ref} className="block h-full w-full" aria-hidden />;
}
