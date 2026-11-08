import { StaticCanvas } from "fabric";
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
  opts: { pxPerMm: number; background: string; maxPx?: number },
): Promise<{ canvas: HTMLCanvasElement; rect: RasterRect; pxPerMm: number }> {
  const rect = rasterRect(geo);
  const maxPx = opts.maxPx ?? 4096;
  const s = Math.min(opts.pxPerMm, maxPx / Math.max(rect.width, rect.height));
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
