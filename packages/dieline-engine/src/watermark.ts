import type { DielineGeometry } from "./geometry-types";
import { flattenOutline } from "./primitives/arc";
import type { Vec2 } from "./primitives/vec2";

/**
 * The watermark on a dieline sheet: text repeated on the crossings of a diagonal lattice,
 * with the lattice lines between them. Pure geometry in sheet millimetres, so the screen,
 * the vector files, the DXF and the 3D model all draw the same thing.
 */
export interface WatermarkSpec {
  readonly text: string;
  /** #rrggbb */
  readonly textColor: string;
  readonly lineColor: string;
  /** Letter size, mm. */
  readonly fontSize: number;
  /** Line thickness, mm; 0 = no lines. */
  readonly lineWidth: number;
}

export interface WatermarkLayout {
  /** Centre of each text, and how wide it is. */
  readonly texts: readonly { readonly x: number; readonly y: number; readonly width: number }[];
  /** Lattice line pieces, inside the cut area. */
  readonly lines: readonly (readonly [number, number, number, number])[];
  readonly tile: { readonly w: number; readonly h: number };
}

/** Font size the repeat spacing is designed for. */
const BASE_FONT_MM = 3.6;
/** Average glyph width in font sizes (used when no real measurement is given). */
const GLYPH_EM = 0.6;

/**
 * One repeat (mm): two rows, the second shifted half a tile, so the text forms a diagonal grid.
 * It grows with the letters, so bigger text never runs into its neighbours.
 */
export function watermarkTile(text: string, fontSize: number): { w: number; h: number } {
  const scale = fontSize / BASE_FONT_MM;
  return { w: Math.max(48 * scale, text.length * fontSize * GLYPH_EM + 12 * scale), h: 30 * scale };
}

type Ring = readonly Vec2[];

/** Even-odd: inside the outer outlines but not in their holes. */
function insideAny(rings: readonly Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/** Does the segment p-q touch the box? (Liang-Barsky.) */
function segmentHitsBox(p: Vec2, q: Vec2, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pk, qk] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ] as const) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const r = qk / pk;
      if (pk < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** Is the whole box inside the cut area? Its centre is inside and no cut edge crosses it. */
function boxInside(rings: readonly Ring[], x0: number, y0: number, x1: number, y1: number): boolean {
  if (!insideAny(rings, (x0 + x1) / 2, (y0 + y1) / 2)) return false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentHitsBox(ring[j]!, ring[i]!, x0, y0, x1, y1)) return false;
    }
  }
  return true;
}

/** The parts of the segment a-b that lie inside the cut area. */
function insidePieces(rings: readonly Ring[], a: Vec2, b: Vec2): [number, number, number, number][] {
  const ts = [0, 1];
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const c = ring[j]!;
      const sx = ring[i]!.x - c.x;
      const sy = ring[i]!.y - c.y;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
      const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  ts.sort((p, q) => p - q);
  const out: [number, number, number, number][] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k]!;
    const t1 = ts[k + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (!insideAny(rings, a.x + rx * tm, a.y + ry * tm)) continue;
    const seg: [number, number, number, number] = [a.x + rx * t0, a.y + ry * t0, a.x + rx * t1, a.y + ry * t1];
    if (Math.hypot(seg[2] - seg[0], seg[3] - seg[1]) >= 0.3) out.push(seg);
  }
  return out;
}

/**
 * Where the watermark goes on this dieline. Texts are placed only where the whole text fits inside the cut
 * area (a text cannot be cut in half in a vector file); the lines are cut off exactly at the cut line.
 * `measure` gives the real width of the text (mm); without it an estimate is used.
 */
export function layoutWatermark(geo: DielineGeometry, spec: WatermarkSpec, measure?: (text: string) => number): WatermarkLayout {
  const text = spec.text.trim();
  const tile = watermarkTile(text, spec.fontSize);
  if (!text) return { texts: [], lines: [], tile };
  const rings = geo.cutLoops.map((l) => flattenOutline(l, 0.05));
  const { min, max } = geo.cutBounds;
  const textW = measure ? measure(text) : text.length * spec.fontSize * GLYPH_EM;
  const half = textW / 2 + 0.5;
  const halfH = spec.fontSize * 0.5 + 0.3;

  // Crossings: the corners of every tile and the middle of every tile.
  const i0 = Math.floor(min.x / tile.w) - 1;
  const i1 = Math.ceil(max.x / tile.w) + 1;
  const j0 = Math.floor(min.y / tile.h) - 1;
  const j1 = Math.ceil(max.y / tile.h) + 1;
  const texts: { x: number; y: number; width: number }[] = [];
  const put = (x: number, y: number) => {
    if (x < min.x || x > max.x || y < min.y || y > max.y) return;
    if (boxInside(rings, x - half, y - halfH, x + half, y + halfH)) texts.push({ x, y, width: textW });
  };
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      put(i * tile.w, j * tile.h);
      put((i + 0.5) * tile.w, (j + 0.5) * tile.h);
    }
  }

  const lines: [number, number, number, number][] = [];
  if (spec.lineWidth > 0) {
    const slope = tile.h / tile.w;
    // y = slope*x + k*h and y = -slope*x + k*h run through every crossing.
    const kMin = Math.floor((min.y - slope * max.x) / tile.h) - 1;
    const kMax = Math.ceil((max.y + slope * max.x) / tile.h) + 1;
    for (let k = kMin; k <= kMax; k++) {
      lines.push(...insidePieces(rings, { x: min.x, y: slope * min.x + k * tile.h }, { x: max.x, y: slope * max.x + k * tile.h }));
      lines.push(...insidePieces(rings, { x: min.x, y: -slope * min.x + k * tile.h }, { x: max.x, y: -slope * max.x + k * tile.h }));
    }
  }
  return { texts, lines, tile };
}
