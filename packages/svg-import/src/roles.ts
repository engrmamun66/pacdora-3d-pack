import { hexToHsl } from "./color";
import type { Role, SvgStyle } from "./types";

export interface RoleInput {
  key: string;
  /** "rrggbb" without '#', or null. */
  color: string | null;
  dashed: boolean;
  /** Total path length in mm. */
  length: number;
  /** Stroke width in mm (0 when the colour came from a fill). */
  width?: number;
  /** True when every path of the style was drawn only by its fill, never stroked. */
  fillOnly?: boolean;
}

const isGreen = (h: number, s: number, l: number) => h >= 90 && h <= 170 && s >= 0.35 && l >= 0.1 && l <= 0.9;
const isVeryLight = (s: number, l: number) => l > 0.85 && s < 0.3;

/**
 * Colour/dash based guess for one style:
 *  - saturated green (hue 90-170), solid or dashed      -> bleed
 *  - any other dashed line (incl. light grey dashes)    -> crease
 *  - solid white / very light grey (lightness > 0.85)   -> ignore
 *  - solid red, magenta, blue, black or any dark colour -> cut
 *  - everything else                                    -> guide
 */
function colourRole(color: string | null, dashed: boolean): Role {
  const { h, s, l } = hexToHsl(color ?? "000000");
  if (color && isGreen(h, s, l)) return "bleed";
  if (dashed) return "crease";
  if (isVeryLight(s, l)) return "ignore";
  const dark = l < 0.3;
  const hueCut = s >= 0.4 && (h <= 15 || h >= 285 || (h >= 195 && h <= 275));
  return dark || hueCut ? "cut" : "guide";
}

const isNeutralGrey = (color: string | null) => {
  if (!color) return false;
  const { s, l } = hexToHsl(color);
  return s < 0.1 && l >= 0.3 && l <= 0.8;
};

/**
 * Second pass: things that are drawn for the human reader, not the cutter.
 *  - fill-only shapes (panel tints, hatch patterns) when real strokes exist  -> ignore
 *  - thin neutral-grey dashed lines (centre lines) when a coloured dashed
 *    style exists to serve as the crease                                      -> guide
 * Both only fire when a better candidate is present, so a file that really
 * draws its folds in grey (or its cut as a filled hairline) is left alone.
 */
function demoteArtwork(items: RoleInput[], roles: Map<string, Role>): void {
  const stroked = items.filter((i) => !i.fillOnly);
  if (stroked.length > 0) {
    for (const it of items) if (it.fillOnly) roles.set(it.key, "ignore");
  }
  const dashed = items.filter((i) => i.dashed && !i.fillOnly);
  const coloured = dashed.some((i) => !isNeutralGrey(i.color));
  if (coloured) {
    for (const it of dashed) {
      if (isNeutralGrey(it.color) && (it.width ?? 0) < 0.3) roles.set(it.key, "guide");
    }
  }
}

/**
 * Applies the colour heuristic, then guarantees a usable result: if no solid
 * style came out as "cut", the solid style with the greatest total length
 * (preferring ones that are not near-white) becomes "cut"; with no solid
 * styles at all the longest style does.
 */
export function assignRoles(items: RoleInput[]): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const it of items) roles.set(it.key, colourRole(it.color, it.dashed));
  if (items.length === 0) return roles;
  demoteArtwork(items, roles);
  const longest = (list: RoleInput[]) => list.reduce((a, b) => (b.length > a.length ? b : a));
  const solid = items.filter((i) => !i.dashed);
  const hasSolidCut = solid.some((i) => roles.get(i.key) === "cut");
  if (!hasSolidCut) {
    const pool = solid.length ? solid : items;
    const visible = pool.filter((i) => roles.get(i.key) !== "ignore");
    roles.set(longest(visible.length ? visible : pool).key, "cut");
  }
  return roles;
}

/** Map of style key -> the role the importer suggested. */
export function suggestRoles(styles: SvgStyle[]): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const s of styles) out[s.key] = s.suggestedRole;
  return out;
}
