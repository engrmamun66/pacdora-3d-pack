import { backgroundPlacement, backgroundTiles } from "@packaging/artwork";
import type { DielineGeometry } from "@packaging/dieline-engine";
import { type BoxBackground, backgroundRepeat } from "@packaging/schema";
import { assetUrl } from "./fabric-map";

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Load (and cache) an uploaded image for drawing on a canvas. */
export function loadBackgroundImage(assetId: string): Promise<HTMLImageElement> {
  let p = cache.get(assetId);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        cache.delete(assetId); // allow a retry
        reject(new Error("The background image could not be loaded."));
      };
      img.src = assetUrl(assetId);
    });
    cache.set(assetId, p);
  }
  return p;
}

/**
 * Draw the box background. `ctx` must already map sheet millimetres to pixels.
 * Clipped to the print area (bleed bounds), exactly as the exports do. Repeats as the background says (`repeat`).
 */
export function paintBackground(ctx: CanvasRenderingContext2D, geo: DielineGeometry, bg: BoxBackground, img: HTMLImageElement) {
  const p = backgroundPlacement(geo, bg, img.naturalWidth, img.naturalHeight);
  if (!p) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.clip.minX, p.clip.minY, p.clip.width, p.clip.height);
  ctx.clip();
  ctx.globalAlpha *= bg.opacity;
  // With repeat on, the picture is drawn once for every copy that touches the print area (a single one if there are too many).
  const tiles = backgroundTiles(p, backgroundRepeat(bg)) ?? [p];
  for (const t of tiles) ctx.drawImage(img, t.cx - t.width / 2, t.cy - t.height / 2, t.width, t.height);
  ctx.restore();
}
