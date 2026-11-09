import * as fontkit from "fontkit";
import { anchorIndex, backgroundPlacement, objectCentre } from "@packaging/artwork";
import { type DielineGeometry, flattenOutline } from "@packaging/dieline-engine";
import { type Artwork, type ArtworkFont, type ArtworkObject, type BoxBackground, MM_PER_PT } from "@packaging/schema";
import { ellipsePath, linePath, mul, outlinePath, pathBounds, polygonPath, rectPath, rotate, scale, transformPath, translate } from "./geometry";
import { imageSize, imageSizeProblem } from "./images";
import { layoutTextbox, lineOutlines, measureWith } from "./text";
import type { Box, Paint, PathCmd, PathItem, Scene, SceneItem, SceneLayer, SpotPaint } from "./types";

export interface FontSource {
  /**
   * Raw font file (TTF/OTF/WOFF/WOFF2) for a family, weight and style.
   * `exact` is false when a substitute was used (e.g. no italic file exists).
   */
  load(family: ArtworkFont, weight: "normal" | "bold", style: "normal" | "italic"): Promise<{ bytes: Uint8Array; exact: boolean }>;
}

export interface ImageSource {
  /** Bytes of an uploaded image, or null if it no longer exists. */
  load(assetId: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
}

/** Total bytes of image data (counted once per placement) one export may embed. */
export const MAX_EMBEDDED_IMAGE_BYTES = 150 * 1024 * 1024;

export interface SceneOptions {
  readonly artwork: boolean;
  readonly dieline: boolean;
  readonly bleedGuide: boolean;
  readonly safeGuide: boolean;
  readonly glueAreas: boolean;
  readonly dimensions: boolean;
  /** Spot colour names for the die lines (printers differ). */
  readonly cutSpot: string;
  readonly creaseSpot: string;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = {
  artwork: true,
  dieline: true,
  bleedGuide: false,
  safeGuide: false,
  glueAreas: false,
  dimensions: false,
  cutSpot: "CutContour",
  creaseSpot: "Crease",
};

/** Line weight of technical lines, mm. */
export const DIELINE_STROKE = 0.25;
const GUIDE_STROKE = 0.1;
const DIM_MARGIN = 22;

const rgb = (hex: string): Paint => ({ kind: "rgb", hex });
const spot = (name: string, cmyk: SpotPaint["cmyk"], preview: string): Paint => ({ kind: "spot", name, cmyk, preview });

function strokePath(name: string, d: PathCmd[], stroke: Paint, width: number): PathItem {
  return { kind: "path", name, d, fill: null, fillRule: "nonzero", stroke, strokeWidth: width, opacity: 1 };
}

/**
 * Build the scene for a project. Pure apart from the font/image loaders, so it
 * runs the same in Node (exports) and in tests.
 */
export async function buildScene(
  geo: DielineGeometry,
  artwork: Artwork,
  src: { fonts: FontSource; images: ImageSource },
  options: Partial<SceneOptions> = {},
): Promise<Scene> {
  const o = { ...DEFAULT_SCENE_OPTIONS, ...options };
  const losses: string[] = [];
  const layers: SceneLayer[] = [];
  const fonts = new Map<string, Promise<fontkit.Font>>();
  const fontFor = (family: ArtworkFont, weight: "normal" | "bold", style: "normal" | "italic") => {
    const key = `${family}|${weight}|${style}`;
    let f = fonts.get(key);
    if (!f) {
      f = src.fonts.load(family, weight, style).then(({ bytes, exact }) => {
        if (!exact) losses.push(`${family} ${weight} ${style} is not available; the closest style was used in the export.`);
        return fontkit.create(Buffer.from(bytes)) as fontkit.Font;
      });
      fonts.set(key, f);
    }
    return f;
  };

  if (o.glueAreas) {
    layers.push({
      id: "glue",
      name: "Glue",
      printable: false,
      items: geo.glueAreas.map((g) => ({ kind: "path", name: `glue ${g.panelId}`, d: outlinePath(g.outline), fill: rgb("#f5b942"), fillRule: "nonzero", stroke: null, strokeWidth: 0, opacity: 0.35 }) as PathItem),
    });
  }

  if (o.artwork) {
    const idx = anchorIndex(geo);
    const budget = { bytes: 0, warned: false };
    const items: SceneItem[] = [];
    // Box background first: it sits under every other artwork item.
    if (artwork.background) items.push(...(await backgroundItems(geo, artwork.background, { images: src.images, losses, budget })));
    for (const a of artwork.objects) {
      if (!a.visible) continue;
      items.push(...(await artworkItems(a, objectCentre(idx, a), { fontFor, images: src.images, losses, budget })));
    }
    layers.push({ id: "artwork", name: "Artwork", printable: true, items });
  }

  if (o.bleedGuide) {
    layers.push({ id: "bleed", name: "Bleed", printable: false, items: [strokePath("bleed", polygonPath(geo.bleedLoop), rgb("#7a7a7a"), GUIDE_STROKE)] });
  }
  if (o.safeGuide) {
    layers.push({ id: "safe", name: "Safe area", printable: false, items: geo.safeAreas.map((s) => strokePath(`safe ${s.panelId}`, polygonPath(s.polygon), rgb("#2ca02c"), GUIDE_STROKE)) });
  }
  if (o.dieline) {
    const crease = spot(o.creaseSpot, [1, 0, 0, 0], "#00a0e9");
    const cut = spot(o.cutSpot, [0, 1, 0, 0], "#e6007e");
    layers.push({ id: "crease", name: "Crease", printable: false, items: geo.creaseLines.map((c) => strokePath(c.id, linePath(c.a.x, c.a.y, c.b.x, c.b.y), crease, DIELINE_STROKE)) });
    layers.push({
      id: "cut",
      name: "Cut",
      printable: false,
      items: [
        ...geo.cutLoops.map((l, i) => strokePath(`cut ${i}`, outlinePath(l), cut, DIELINE_STROKE)),
        ...geo.slitLines.map((s) => strokePath(s.id, linePath(s.a.x, s.a.y, s.b.x, s.b.y), cut, DIELINE_STROKE)),
      ],
    });
  }

  const bb = geo.bleedBounds;
  const bleedBox: Box = { minX: bb.min.x, minY: bb.min.y, width: bb.max.x - bb.min.x, height: bb.max.y - bb.min.y };
  const cb = geo.cutBounds;
  const trimBox: Box = { minX: cb.min.x, minY: cb.min.y, width: cb.max.x - cb.min.x, height: cb.max.y - cb.min.y };
  let mediaBox = bleedBox;
  if (o.dimensions) {
    const font = await fontFor("Inter", "normal", "normal");
    const items: SceneItem[] = [];
    const ink = rgb("#333333");
    for (const an of geo.annotations) {
      const dx = an.p2.x - an.p1.x;
      const dy = an.p2.y - an.p1.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const a = { x: an.p1.x + nx * an.offset, y: an.p1.y + ny * an.offset };
      const b = { x: an.p2.x + nx * an.offset, y: an.p2.y + ny * an.offset };
      items.push(strokePath(`${an.id} line`, [...linePath(a.x, a.y, b.x, b.y), ...linePath(an.p1.x, an.p1.y, a.x, a.y), ...linePath(an.p2.x, an.p2.y, b.x, b.y)], ink, GUIDE_STROKE));
      const size = 3.2;
      const w = measureWith(font, size)(an.text);
      const { d } = lineOutlines(font, size, an.text, -w / 2, -0.8);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const m = mul(translate((a.x + b.x) / 2, (a.y + b.y) / 2), rotate(Math.abs(ang) > 90 ? ang + 180 : ang));
      items.push({ kind: "path", name: `${an.id} text`, d: transformPath(d, m), fill: ink, fillRule: "nonzero", stroke: null, strokeWidth: 0, opacity: 1 });
    }
    layers.push({ id: "dimensions", name: "Dimensions", printable: false, items });
    mediaBox = { minX: bleedBox.minX - DIM_MARGIN, minY: bleedBox.minY - DIM_MARGIN, width: bleedBox.width + 2 * DIM_MARGIN, height: bleedBox.height + 2 * DIM_MARGIN };
  }

  // Artwork outside the page is clipped by every backend; say so.
  const art = layers.find((l) => l.id === "artwork");
  if (art) {
    const outside = art.items.filter((it) => {
      if (it.kind !== "path") return false;
      const b = pathBounds(it.d);
      return b.maxX < mediaBox.minX || b.minX > mediaBox.minX + mediaBox.width || b.maxY < mediaBox.minY || b.minY > mediaBox.minY + mediaBox.height;
    });
    if (outside.length) losses.push(`${outside.length} artwork item(s) lie completely outside the page and are not visible.`);
  }

  return { unit: "mm", mediaBox, trimBox, bleedBox, layers, losses };
}

/** The box background as one image item, cut off at the print area (bleed bounds). */
async function backgroundItems(
  geo: DielineGeometry,
  bg: BoxBackground,
  ctx: { images: ImageSource; losses: string[]; budget: { bytes: number; warned: boolean } },
): Promise<SceneItem[]> {
  const img = await ctx.images.load(bg.assetId);
  const size = img && (img.mime === "image/png" || img.mime === "image/jpeg") ? imageSize(img.bytes, img.mime) : null;
  if (!img || !size) {
    ctx.losses.push("The box background image is missing or unsupported and was left out.");
    return [];
  }
  const problem = imageSizeProblem(size);
  if (problem) {
    ctx.losses.push(`The box background image was left out: ${problem}.`);
    return [];
  }
  ctx.budget.bytes += img.bytes.length;
  if (ctx.budget.bytes > MAX_EMBEDDED_IMAGE_BYTES) {
    ctx.losses.push("The box background image was left out: the total image data in this export is too large.");
    ctx.budget.warned = true;
    return [];
  }
  const p = backgroundPlacement(geo, bg, size.width, size.height);
  if (!p) return [];
  const m = mul(translate(p.cx, p.cy), mul(scale(p.width, p.height), translate(-0.5, -0.5)));
  return [{ kind: "image", name: "Box background", opacity: bg.opacity, mime: img.mime as "image/png" | "image/jpeg", bytes: img.bytes, pxWidth: size.width, pxHeight: size.height, matrix: m, clip: p.clip }];
}

async function artworkItems(
  a: ArtworkObject,
  c: { x: number; y: number },
  ctx: {
    fontFor: (f: ArtworkFont, w: "normal" | "bold", s: "normal" | "italic") => Promise<fontkit.Font>;
    images: ImageSource;
    losses: string[];
    budget: { bytes: number; warned: boolean };
  },
): Promise<SceneItem[]> {
  const place = mul(translate(c.x, c.y), rotate(a.angle));
  const base = { name: a.name, opacity: a.opacity };
  switch (a.type) {
    case "rect":
    case "ellipse": {
      const d = a.type === "rect" ? rectPath(a.width, a.height, a.cornerRadius) : ellipsePath(a.width / 2, a.height / 2);
      return [{ kind: "path", ...base, d: transformPath(d, place), fill: a.fill ? rgb(a.fill) : null, fillRule: "nonzero", stroke: a.stroke && a.strokeWidth > 0 ? rgb(a.stroke) : null, strokeWidth: a.strokeWidth }];
    }
    case "line":
      return [{ kind: "path", ...base, d: transformPath(linePath(-a.length / 2, 0, a.length / 2, 0), place), fill: null, fillRule: "nonzero", stroke: rgb(a.stroke), strokeWidth: a.strokeWidth }];
    case "text": {
      const font = await ctx.fontFor(a.fontFamily, a.fontWeight, a.fontStyle);
      const size = a.fontSizePt * MM_PER_PT;
      const layout = layoutTextbox(a.text, { width: a.width, fontSize: size, lineHeight: a.lineHeight, align: a.textAlign }, measureWith(font, size));
      const d: PathCmd[] = [];
      let missing = 0;
      for (const line of layout.lines) {
        const r = lineOutlines(font, size, line.text, line.x, line.baseline);
        d.push(...r.d);
        missing += r.missing;
      }
      if (missing) ctx.losses.push(`Text "${a.name}": ${missing} character(s) are not in the font ${a.fontFamily} and are left out.`);
      // Glyph outlines overlap (e.g. accents): nonzero keeps them solid.
      return d.length ? [{ kind: "path", ...base, d: transformPath(d, place), fill: rgb(a.fill), fillRule: "nonzero", stroke: null, strokeWidth: 0 }] : [];
    }
    case "image": {
      const img = await ctx.images.load(a.assetId);
      const size = img && (img.mime === "image/png" || img.mime === "image/jpeg") ? imageSize(img.bytes, img.mime) : null;
      if (!img || !size) {
        ctx.losses.push(`Image "${a.name}" is missing or unsupported and was left out.`);
        return [];
      }
      const problem = imageSizeProblem(size);
      if (problem) {
        ctx.losses.push(`Image "${a.name}" was left out: ${problem}.`);
        return [];
      }
      // Budget for all placements together (each placement is written into the file).
      ctx.budget.bytes += img.bytes.length;
      if (ctx.budget.bytes > MAX_EMBEDDED_IMAGE_BYTES) {
        if (!ctx.budget.warned) ctx.losses.push("Some images were left out: the total image data in this export is too large.");
        ctx.budget.warned = true;
        return [];
      }
      // Unit square -> centred box of width x height mm, flipped as in the editor, then rotated and placed.
      const m = mul(place, mul(scale(a.width * (a.flipX ? -1 : 1), a.height * (a.flipY ? -1 : 1)), translate(-0.5, -0.5)));
      return [{ kind: "image", ...base, mime: img.mime as "image/png" | "image/jpeg", bytes: img.bytes, pxWidth: size.width, pxHeight: size.height, matrix: m }];
    }
  }
}

/** Every vertex of the cut outline (for dimension checks in tests). */
export const cutPolygon = (geo: DielineGeometry) => flattenOutline(geo.cutLoops[0]!);
