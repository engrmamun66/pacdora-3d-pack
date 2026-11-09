import type { ImportedDieline, Role } from "./types";

type Drawn = "cut" | "crease" | "bleed" | "guide";

const LOOK: Record<Drawn, { color: string; dash: string | null }> = {
  cut: { color: "#e6007e", dash: null },
  crease: { color: "#00a0e9", dash: "3 1.5" },
  bleed: { color: "#7a7a7a", dash: "2 1.5" },
  guide: { color: "#2ca02c", dash: "1 1.5" },
};
const STROKE_MM = 0.25;

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

function roleOf(d: ImportedDieline, roles: Record<string, Role>, key: string): Role {
  const r = roles[key];
  if (r) return r;
  // styles the caller did not map keep the importer's suggestion
  return d.styles.find((s) => s.key === key)?.suggestedRole ?? "guide";
}

/** Normalised SVG in millimetres: one group per role, ready for display or as input to other tools. */
export function toCleanSvg(
  d: ImportedDieline,
  roles: Record<string, Role>,
  opts: { margin?: number; showBleed?: boolean; showGuides?: boolean } = {},
): string {
  const margin = opts.margin !== undefined && Number.isFinite(opts.margin) && opts.margin >= 0 ? opts.margin : 2;
  const showBleed = opts.showBleed ?? true;
  const showGuides = opts.showGuides ?? true;
  const w = d.widthMm + 2 * margin;
  const h = d.heightMm + 2 * margin;

  const parts: Record<Drawn, string[]> = { cut: [], crease: [], bleed: [], guide: [] };
  for (const p of d.paths) {
    const role = roleOf(d, roles, p.style);
    if (role === "ignore") continue;
    if (role === "bleed" && !showBleed) continue;
    if (role === "guide" && !showGuides) continue;
    const pts = p.pts;
    let s = `M${fmt(pts[0]! + margin)} ${fmt(pts[1]! + margin)}`;
    for (let i = 2; i < pts.length; i += 2) s += ` L${fmt(pts[i]! + margin)} ${fmt(pts[i + 1]! + margin)}`;
    if (p.closed) s += " Z";
    parts[role].push(`<path d="${s}"/>`);
  }

  // cut is drawn last so it stays on top
  const order: Drawn[] = ["bleed", "guide", "crease", "cut"];
  const groups = order
    .filter((r) => parts[r].length > 0)
    .map((r) => {
      const look = LOOK[r];
      const dash = look.dash ? ` stroke-dasharray="${look.dash}"` : "";
      return `<g id="${r}" fill="none" stroke="${look.color}" stroke-width="${STROKE_MM}"${dash}>\n${parts[r].join("\n")}\n</g>`;
    });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">\n` +
    groups.join("\n") +
    "\n</svg>\n"
  );
}

/**
 * DXF R12 (AC1009) ASCII of the cut, crease and bleed paths, y-up, mm.
 * Same structure and CRLF line endings as the repo's dieline DXF writer.
 */
export function toDxf(d: ImportedDieline, roles: Record<string, Role>): string {
  const H = d.heightMm;
  const f = (v: number) => (Math.round(v * 1e6) / 1e6).toString();
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? f(value) : value);
  const layerOf: Partial<Record<Role, string>> = { cut: "CUT", crease: "CREASE", bleed: "BLEED" };

  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$ACADVER");
  g(1, "AC1009");
  g(9, "$EXTMIN");
  g(10, 0);
  g(20, 0);
  g(9, "$EXTMAX");
  g(10, d.widthMm);
  g(20, d.heightMm);
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "TABLES");
  g(0, "TABLE");
  g(2, "LTYPE");
  g(70, "1");
  g(0, "LTYPE");
  g(2, "CONTINUOUS");
  g(70, "0");
  g(3, "Solid line");
  g(72, "65");
  g(73, "0");
  g(40, 0);
  g(0, "ENDTAB");
  g(0, "TABLE");
  g(2, "LAYER");
  g(70, "3");
  for (const [name, color] of [["CUT", "6"], ["CREASE", "4"], ["BLEED", "8"]] as const) {
    g(0, "LAYER");
    g(2, name);
    g(70, "0");
    g(62, color);
    g(6, "CONTINUOUS");
  }
  g(0, "ENDTAB");
  g(0, "ENDSEC");

  g(0, "SECTION");
  g(2, "ENTITIES");
  for (const p of d.paths) {
    const layer = layerOf[roleOf(d, roles, p.style)];
    if (!layer) continue;
    g(0, "POLYLINE");
    g(8, layer);
    g(66, "1");
    g(70, p.closed ? "1" : "0");
    for (let i = 0; i < p.pts.length; i += 2) {
      g(0, "VERTEX");
      g(8, layer);
      g(10, p.pts[i]!);
      g(20, H - p.pts[i + 1]!);
    }
    g(0, "SEQEND");
    g(8, layer);
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
