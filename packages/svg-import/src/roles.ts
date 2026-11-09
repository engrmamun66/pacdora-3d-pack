import { hexToHsl } from "./color";
import type { Role, SvgStyle } from "./types";

export interface RoleInput {
  key: string;
  /** "rrggbb" without '#', or null. */
  color: string | null;
  dashed: boolean;
  /** Total path length in mm. */
  length: number;
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
