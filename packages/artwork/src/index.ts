import {
  type DielineGeometry,
  type Panel,
  type Vec2,
  flattenOutline,
  outlineBounds,
  panelOutline,
  vec,
} from "@packaging/dieline-engine";
import type { Artwork, ArtworkObject, BoxBackground } from "@packaging/schema";

/**
 * Artwork anchoring: converts between the stored form (centre offset from a
 * panel's bounding-box centre) and absolute flat-sheet positions. Pure; used
 * by the 2D editor, the 3D texture and every exporter, so they all place
 * artwork identically.
 */

const centreOf = (b: { min: Vec2; max: Vec2 }): Vec2 => vec((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2);

export interface AnchorIndex {
  readonly sheet: Vec2;
  readonly panels: ReadonlyMap<string, { readonly centre: Vec2; readonly polygon: readonly Vec2[]; readonly panel: Panel }>;
}

export function anchorIndex(geo: DielineGeometry): AnchorIndex {
  const panels = new Map<string, { centre: Vec2; polygon: Vec2[]; panel: Panel }>();
  for (const p of geo.foldTree.panels) {
    const o = panelOutline(p);
    panels.set(p.id, { centre: centreOf(outlineBounds(o)), polygon: flattenOutline(o, 0.05), panel: p });
  }
  return { sheet: centreOf(geo.cutBounds), panels };
}

/** Anchor point for a panel id; falls back to the sheet centre if the panel no longer exists. */
export function anchorPoint(idx: AnchorIndex, panelId: string | null): Vec2 {
  return (panelId && idx.panels.get(panelId)?.centre) || idx.sheet;
}

/** Absolute centre (sheet mm) of an artwork object. */
export function objectCentre(idx: AnchorIndex, o: Pick<ArtworkObject, "panelId" | "dx" | "dy">): Vec2 {
  const a = anchorPoint(idx, o.panelId);
  return vec(a.x + o.dx, a.y + o.dy);
}

/** Even-odd ray casting. Points exactly on an edge may go either way. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Panel containing a sheet point, or null. Panels never overlap on the flat sheet. */
export function panelAt(idx: AnchorIndex, p: Vec2): string | null {
  for (const [id, entry] of idx.panels) if (pointInPolygon(p, entry.polygon)) return id;
  return null;
}

/** Stored anchor for an object whose centre is at `centre` (sheet mm). */
export function anchorFor(idx: AnchorIndex, centre: Vec2): { panelId: string | null; dx: number; dy: number } {
  const panelId = panelAt(idx, centre);
  const a = anchorPoint(idx, panelId);
  return { panelId, dx: centre.x - a.x, dy: centre.y - a.y };
}

/** Objects whose panel no longer exists (e.g. a template change); they are shown relative to the sheet. */
export function orphanedObjects(idx: AnchorIndex, artwork: Artwork): ArtworkObject[] {
  return artwork.objects.filter((o) => o.panelId !== null && !idx.panels.has(o.panelId));
}

/** Where a box background image goes on the flat sheet (millimetres, y down). */
export interface BackgroundPlacement {
  /** Centre of the drawn image. */
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  /** The print area (bleed bounds): everything outside it is clipped. */
  readonly clip: { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };
}

/**
 * Pure placement of the box background for an image of `imgW` x `imgH` pixels.
 * The editor, the 3D texture and every exporter call this, so they agree.
 * Returns null for an unusable image size.
 */
export function backgroundPlacement(geo: DielineGeometry, bg: Pick<BoxBackground, "fit" | "scale" | "dx" | "dy">, imgW: number, imgH: number): BackgroundPlacement | null {
  if (!(imgW > 0) || !(imgH > 0)) return null;
  const b = geo.bleedBounds;
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  let bw: number;
  let bh: number;
  if (bg.fit === "stretch") {
    bw = w;
    bh = h;
  } else {
    const k = bg.fit === "cover" ? Math.max(w / imgW, h / imgH) : Math.min(w / imgW, h / imgH);
    bw = imgW * k;
    bh = imgH * k;
  }
  return {
    cx: (b.min.x + b.max.x) / 2 + bg.dx,
    cy: (b.min.y + b.max.y) / 2 + bg.dy,
    width: bw * bg.scale,
    height: bh * bg.scale,
    clip: { minX: b.min.x, minY: b.min.y, width: w, height: h },
  };
}
