import { StaticCanvas } from "fabric";
import { STYLE, outlinePathD } from "@packaging/render-svg";
import { anchorIndex } from "@packaging/artwork";
import type { DielineGeometry } from "@packaging/dieline-engine";
import type { Artwork } from "@packaging/schema";
import { ensureFont } from "./editor-controller";
import { toFabric } from "./fabric-map";

export interface RasterRect {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/** Sheet region covered by artwork rasters: the bleed bounds (artwork may run into the bleed). */
export function rasterRect(geo: DielineGeometry): RasterRect {
  const b = geo.bleedBounds;
  return { minX: b.min.x, minY: b.min.y, width: b.max.x - b.min.x, height: b.max.y - b.min.y };
}

/**
 * Render the artwork in flat-sheet space onto a new canvas, using exactly the
 * editor's object mapping. `background` fills the whole raster (board colour).
 * Hidden objects are skipped; images that fail to load are left out.
 */
export async function renderArtwork(
  geo: DielineGeometry,
  artwork: Artwork,
  opts: { pxPerMm: number; background: string; maxPx?: number; maxArea?: number },
): Promise<{ canvas: HTMLCanvasElement; rect: RasterRect; pxPerMm: number }> {
  const rect = rasterRect(geo);
  const maxPx = opts.maxPx ?? 4096;
  // Browsers cap canvas size (Safari: about 16.7 million pixels); stay below it.
  const maxArea = opts.maxArea ?? 16_000_000;
  const s = Math.min(opts.pxPerMm, maxPx / Math.max(rect.width, rect.height), Math.sqrt(maxArea / (rect.width * rect.height)));
  const w = Math.max(1, Math.round(rect.width * s));
  const h = Math.max(1, Math.round(rect.height * s));
  const idx = anchorIndex(geo);

  const visible = artwork.objects.filter((o) => o.visible);
  await Promise.all(visible.map((o) => (o.type === "text" ? ensureFont(o.fontFamily, o.fontWeight, o.fontStyle) : null)));
  const objects = (await Promise.allSettled(visible.map((o) => toFabric(o, idx)))).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  const el = document.createElement("canvas");
  const sc = new StaticCanvas(el, { width: w, height: h, enableRetinaScaling: false, renderOnAddRemove: false, backgroundColor: opts.background });
  sc.setViewportTransform([s, 0, 0, s, -rect.minX * s, -rect.minY * s]);
  if (objects.length) sc.add(...objects);
  sc.renderAll();

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(sc.lowerCanvasEl, 0, 0);
  await sc.dispose();
  return { canvas: out, rect, pxPerMm: s };
}

/**
 * PNG of the flat artwork at a given resolution, optionally with the die lines
 * drawn on top. Returns the effective DPI (lower than asked if the browser
 * canvas limit was reached).
 */
export async function renderPng(
  geo: DielineGeometry,
  artwork: Artwork,
  opts: { dpi: number; background: string; dieline: boolean },
): Promise<{ blob: Blob; dpi: number; width: number; height: number }> {
  const r = await renderArtwork(geo, artwork, { pxPerMm: opts.dpi / 25.4, background: opts.background, maxPx: 16384 });
  if (opts.dieline) {
    const ctx = r.canvas.getContext("2d")!;
    const s = r.pxPerMm;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -r.rect.minX * s, -r.rect.minY * s);
    ctx.lineWidth = Math.max(1 / s, 0.25);
    ctx.strokeStyle = STYLE.crease.stroke;
    ctx.setLineDash([3, 1.5]);
    ctx.beginPath();
    for (const c of geo.creaseLines) {
      ctx.moveTo(c.a.x, c.a.y);
      ctx.lineTo(c.b.x, c.b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = STYLE.cut.stroke;
    for (const loop of geo.cutLoops) ctx.stroke(new Path2D(outlinePathD(loop)));
    ctx.beginPath();
    for (const sl of geo.slitLines) {
      ctx.moveTo(sl.a.x, sl.a.y);
      ctx.lineTo(sl.b.x, sl.b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
  const blob = await new Promise<Blob>((res, rej) => r.canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG encoding failed."))), "image/png"));
  return { blob, dpi: Math.round(r.pxPerMm * 25.4), width: r.canvas.width, height: r.canvas.height };
}
