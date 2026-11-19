import { rasterRect, type RasterRect } from "@/components/editor/artwork-raster";
import type { DielineGeometry } from "@packaging/dieline-engine";
import type { SampleStyle } from "@/lib/sample-boxes";

/**
 * The gradient of a style painted on a flat sheet picture (the outside of the box), or null for a plain colour / no style.
 * Browser only (it makes a canvas). The picture covers the sheet, so the gradient runs across the whole unfolded box.
 */
export function gradientTexture(geo: DielineGeometry, style: SampleStyle): { canvas: HTMLCanvasElement; rect: RasterRect } | null {
  const g = style.gradient;
  if (!g || typeof document === "undefined") return null;
  const rect = rasterRect(geo);
  const px = Math.min(2, 1600 / Math.max(rect.width, rect.height)); // pixels per mm: a gradient needs few
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(rect.width * px));
  canvas.height = Math.max(2, Math.round(rect.height * px));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // CSS angles: 0 = bottom to top, 90 = left to right. The line goes through the middle and just reaches the corners.
  const a = (g.angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(canvas.width * dx) + Math.abs(canvas.height * dy)) / 2;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  grad.addColorStop(0, g.from);
  grad.addColorStop(1, g.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, rect };
}
