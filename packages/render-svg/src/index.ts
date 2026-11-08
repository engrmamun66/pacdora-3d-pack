import { type DielineGeometry, type LinearAnnotation, type Outline, type Vec2, arcFromBulge, bulgeAt, length, sub } from "@packaging/dieline-engine";

export interface SvgOptions {
  readonly showBleed?: boolean;
  readonly showSafe?: boolean;
  readonly showGlue?: boolean;
  readonly showAnnotations?: boolean;
  readonly showPanelLabels?: boolean;
  /** Extra white space around the artwork area, mm (room for dimension lines). */
  readonly margin?: number;
  /** Multiplies all line widths (e.g. 4 for small thumbnails). Default 1. */
  readonly strokeScale?: number;
}

const DEFAULT_MARGIN = 22;

/**
 * The sheet rectangle (mm) the SVG covers. Exposed so a 3D texture made from
 * this SVG can use the identical rectangle for UV mapping.
 */
export function dielineViewBox(geo: DielineGeometry, margin: number = DEFAULT_MARGIN) {
  const b = geo.bleedBounds;
  return {
    minX: b.min.x - margin,
    minY: b.min.y - margin,
    width: b.max.x - b.min.x + 2 * margin,
    height: b.max.y - b.min.y + 2 * margin,
  };
}

/** Visual style per line type. Colours are conventional dieline-style, not a printer standard. */
export const STYLE = {
  cut: { stroke: "#e6007e", width: 0.25 },
  crease: { stroke: "#00a0e9", width: 0.25, dash: "3 1.5" },
  bleed: { stroke: "#7a7a7a", width: 0.15, dash: "1 1" },
  safe: { stroke: "#2ca02c", width: 0.15, dash: "2 1" },
  glue: { fill: "#f5b942", opacity: 0.35 },
  annotation: { stroke: "#333333", width: 0.15, fontSize: 3.2 },
} as const;

const n = (v: number): string => (Math.round(v * 10_000) / 10_000).toString();
const pts = (poly: readonly Vec2[]): string => poly.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
const pathD = (poly: readonly Vec2[]): string => `M${poly.map((p) => `${n(p.x)} ${n(p.y)}`).join(" L")} Z`;

/** SVG path for an outline with true circular arcs (SVG "A" commands). */
export function outlinePathD(o: Outline): string {
  const pts = o.points;
  const parts = [`M${n(pts[0]!.x)} ${n(pts[0]!.y)}`];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const bulge = bulgeAt(o, i);
    if (bulge === 0) {
      if (i < pts.length - 1) parts.push(`L${n(b.x)} ${n(b.y)}`);
      continue;
    }
    const arc = arcFromBulge(a, b, bulge);
    const large = Math.abs(arc.sweep) > Math.PI ? 1 : 0;
    // SVG sweep-flag 1 = increasing angle in the SVG (y-down) frame, same frame as ours.
    const sweep = arc.sweep > 0 ? 1 : 0;
    parts.push(`A${n(arc.radius)} ${n(arc.radius)} 0 ${large} ${sweep} ${n(b.x)} ${n(b.y)}`);
  }
  return parts.join(" ") + " Z";
}
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layer(id: string, label: string, body: string): string {
  return `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${esc(label)}">${body}</g>`;
}

function annotationSvg(a: LinearAnnotation): string {
  const dir = sub(a.p2, a.p1);
  const len = length(dir);
  const nx = -dir.y / len;
  const ny = dir.x / len;
  const q1 = { x: a.p1.x + nx * a.offset, y: a.p1.y + ny * a.offset };
  const q2 = { x: a.p2.x + nx * a.offset, y: a.p2.y + ny * a.offset };
  const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
  const s = STYLE.annotation;
  const tick = 1.2;
  const ext = (p: Vec2, q: Vec2) =>
    `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(q.x)}" y2="${n(q.y)}"/>`;
  const tx = (q: Vec2) =>
    `<line x1="${n(q.x - tick)}" y1="${n(q.y - tick)}" x2="${n(q.x + tick)}" y2="${n(q.y + tick)}"/>`;
  const vertical = Math.abs(dir.x) < Math.abs(dir.y);
  // Text sits on the opposite side of the line from the geometry, rotated for vertical dims.
  const off = s.fontSize * 0.4;
  const tpos = vertical ? { x: mid.x - off, y: mid.y } : { x: mid.x, y: mid.y - off };
  const rot = vertical ? ` transform="rotate(-90 ${n(tpos.x)} ${n(tpos.y)})"` : "";
  return (
    `<g id="${esc(a.id)}" stroke="${s.stroke}" stroke-width="${s.width}" fill="none">` +
    ext(a.p1, q1) + ext(a.p2, q2) + ext(q1, q2) + tx(q1) + tx(q2) +
    `<text x="${n(tpos.x)}" y="${n(tpos.y)}" font-size="${s.fontSize}" font-family="Arial, Helvetica, sans-serif" ` +
    `text-anchor="middle" fill="${s.stroke}" stroke="none"${rot}>${esc(a.text)}</text></g>`
  );
}

/**
 * Render a dieline as a standalone SVG. The viewBox is in millimetres and the
 * width/height carry mm units, so the file opens at true physical size.
 */
export function renderDielineSvg(geo: DielineGeometry, opts: SvgOptions = {}): string {
  const o = { showBleed: true, showSafe: true, showGlue: true, showAnnotations: true, showPanelLabels: false, margin: DEFAULT_MARGIN, strokeScale: 1, ...opts };
  const sw = (w: number) => n(w * o.strokeScale);
  const { minX, minY, width: w, height: h } = dielineViewBox(geo, o.margin);

  const layers: string[] = [];
  if (o.showBleed) {
    const s = STYLE.bleed;
    layers.push(
      layer("bleed", "Bleed", `<path d="${pathD(geo.bleedLoop)}" fill="none" stroke="${s.stroke}" stroke-width="${sw(s.width)}" stroke-dasharray="${s.dash}"/>`),
    );
  }
  if (o.showGlue) {
    const s = STYLE.glue;
    layers.push(
      layer("glue", "Glue", geo.glueAreas.map((g) => `<path d="${outlinePathD(g.outline)}" fill="${s.fill}" fill-opacity="${s.opacity}" stroke="none"/>`).join("")),
    );
  }
  if (o.showSafe) {
    const s = STYLE.safe;
    layers.push(
      layer("safe", "Safe area", geo.safeAreas.map((a) => `<polygon points="${pts(a.polygon)}" fill="none" stroke="${s.stroke}" stroke-width="${sw(s.width)}" stroke-dasharray="${s.dash}"/>`).join("")),
    );
  }
  {
    const s = STYLE.crease;
    layers.push(
      layer(
        "crease",
        "Crease",
        geo.creaseLines
          .map((c) => `<line id="${esc(c.id)}" x1="${n(c.a.x)}" y1="${n(c.a.y)}" x2="${n(c.b.x)}" y2="${n(c.b.y)}" stroke="${s.stroke}" stroke-width="${sw(s.width)}" stroke-dasharray="${s.dash}"/>`)
          .join(""),
      ),
    );
  }
  {
    const s = STYLE.cut;
    layers.push(
      layer("cut", "Cut", geo.cutLoops.map((l) => `<path d="${outlinePathD(l)}" fill="none" stroke="${s.stroke}" stroke-width="${sw(s.width)}" stroke-linejoin="miter"/>`).join("") +
          geo.slitLines.map((c) => `<line id="${esc(c.id)}" x1="${n(c.a.x)}" y1="${n(c.a.y)}" x2="${n(c.b.x)}" y2="${n(c.b.y)}" stroke="${s.stroke}" stroke-width="${sw(s.width)}"/>`).join("")),
    );
  }
  if (o.showPanelLabels) {
    layers.push(
      layer(
        "labels",
        "Panel labels",
        geo.foldTree.panels
          .map((p) => {
            const cx = p.polygon.reduce((s, q) => s + q.x, 0) / p.polygon.length;
            const cy = p.polygon.reduce((s, q) => s + q.y, 0) / p.polygon.length;
            return `<text x="${n(cx)}" y="${n(cy)}" font-size="3" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" fill="#999">${esc(p.label)}</text>`;
          })
          .join(""),
      ),
    );
  }
  if (o.showAnnotations) layers.push(layer("annotations", "Dimensions", geo.annotations.map(annotationSvg).join("")));

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}">\n` +
    `<title>${esc(geo.templateId)} dieline (mm)</title>\n` +
    `<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>\n` +
    layers.join("\n") +
    `\n</svg>\n`
  );
}
