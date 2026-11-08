import { generateDieline, type DielineGeometry } from "@packaging/dieline-engine";
import { renderDielineSvg } from "@packaging/render-svg";

/** SVG -> data URL for <img> (no innerHTML needed). */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Compact thumbnail of a dieline (cut, crease, glue only). */
export function thumbnailSvg(geo: DielineGeometry): string {
  return renderDielineSvg(geo, { showAnnotations: false, showBleed: false, showSafe: false, margin: 2, strokeScale: 4 });
}

/** Thumbnail for stored params; null if the params no longer generate (e.g. after a rule change). */
export function tryThumbnail(generatorId: string, params: unknown): string | null {
  try {
    return svgDataUrl(thumbnailSvg(generateDieline(generatorId, params)));
  } catch {
    return null;
  }
}
