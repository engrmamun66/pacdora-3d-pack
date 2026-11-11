import { type DielineGeometry, type WatermarkSpec, layoutWatermark } from "@packaging/dieline-engine";

/**
 * Draw the watermark on a 2D canvas that shows the flat sheet. `rect` is the sheet area (mm) the canvas covers
 * and `pxPerMm` its resolution. Same layout as the vector files: whole texts inside the cut area, lines cut off at it.
 */
export function drawWatermark(ctx: CanvasRenderingContext2D, geo: DielineGeometry, spec: WatermarkSpec, rect: { minX: number; minY: number }, pxPerMm: number): void {
  const layout = layoutWatermark(geo, spec);
  if (!layout.texts.length && !layout.lines.length) return;
  ctx.save();
  ctx.setTransform(pxPerMm, 0, 0, pxPerMm, -rect.minX * pxPerMm, -rect.minY * pxPerMm);
  if (layout.lines.length && spec.lineWidth > 0) {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = spec.lineColor;
    ctx.lineWidth = spec.lineWidth;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of layout.lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  if (layout.texts.length) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = spec.textColor;
    ctx.font = `600 ${spec.fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of layout.texts) ctx.fillText(spec.text.trim(), t.x, t.y);
  }
  ctx.restore();
}
