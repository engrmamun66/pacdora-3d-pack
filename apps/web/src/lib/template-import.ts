import type { ImportedDieline, Role } from "@packaging/svg-import";

export const MAX_SVG_CHARS = 3_000_000;

export const ROLE_LABELS: Record<Role, string> = { cut: "Cut", crease: "Crease", bleed: "Bleed", guide: "Guide", ignore: "Ignore" };
export const ROLE_HINTS: Record<Role, string> = {
  cut: "Die-cut outline and slits",
  crease: "Fold lines",
  bleed: "Bleed boundary",
  guide: "Reference only (safe area, notes)",
  ignore: "Leave out",
};
export const ROLE_ORDER: Role[] = ["cut", "crease", "bleed", "guide", "ignore"];

/** Colours used everywhere a dieline is drawn (same as the parametric dielines). */
export const ROLE_COLOR: Record<Role, string> = { cut: "#e6007e", crease: "#00a0e9", bleed: "#7a7a7a", guide: "#2ca02c", ignore: "#bbbbbb" };

/** SVG path data for one imported path (coordinates already in mm). */
export function pathData(pts: readonly number[], closed: boolean): string {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i += 2) d += `${i === 0 ? "M" : "L"}${Math.round(pts[i]! * 100) / 100} ${Math.round(pts[i + 1]! * 100) / 100}`;
  return closed ? `${d}Z` : d;
}

/**
 * Small SVG for list pages: cut and crease only, points thinned to about
 * 1/200 of the sheet so even huge files give a few kilobytes.
 */
export function thumbnailSvg(d: ImportedDieline, roles: Record<string, Role>): string {
  const size = Math.max(d.widthMm, d.heightMm);
  const minGap = size / 200;
  const pad = size * 0.02;
  const sw = size / 250;
  const parts: string[] = [];
  const byRole = (role: Role) => {
    let out = "";
    for (const p of d.paths) {
      if ((roles[p.style] ?? "ignore") !== role) continue;
      const kept: number[] = [];
      let lx = Infinity;
      let ly = Infinity;
      for (let i = 0; i + 1 < p.pts.length; i += 2) {
        const x = p.pts[i]!;
        const y = p.pts[i + 1]!;
        const last = i + 2 >= p.pts.length;
        if (kept.length === 0 || last || Math.hypot(x - lx, y - ly) >= minGap) {
          kept.push(x, y);
          lx = x;
          ly = y;
        }
      }
      if (kept.length >= 4) out += pathData(kept, p.closed);
    }
    return out;
  };
  const crease = byRole("crease");
  const cut = byRole("cut");
  if (crease) parts.push(`<path d="${crease}" fill="none" stroke="${ROLE_COLOR.crease}" stroke-width="${sw.toFixed(3)}" stroke-dasharray="${(sw * 4).toFixed(2)} ${(sw * 2).toFixed(2)}"/>`);
  if (cut) parts.push(`<path d="${cut}" fill="none" stroke="${ROLE_COLOR.cut}" stroke-width="${(sw * 1.2).toFixed(3)}"/>`);
  const w = d.widthMm + 2 * pad;
  const h = d.heightMm + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(-pad).toFixed(2)} ${(-pad).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">${parts.join("")}</svg>`;
}
