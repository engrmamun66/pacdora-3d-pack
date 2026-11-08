import type { Paint, PathCmd, Scene, SceneItem } from "./types";

const n = (v: number) => (Math.round(v * 10_000) / 10_000).toString();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function pathData(d: readonly PathCmd[]): string {
  return d
    .map((c) => (c.op === "Z" ? "Z" : c.op === "C" ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}` : `${c.op}${n(c.x)} ${n(c.y)}`))
    .join("");
}

const paint = (p: Paint | null) => (p === null ? "none" : p.kind === "rgb" ? p.hex : p.preview);

function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function item(it: SceneItem): string {
  const op = it.opacity < 1 ? ` opacity="${n(it.opacity)}"` : "";
  const title = it.name ? `<title>${esc(it.name)}</title>` : "";
  if (it.kind === "image") {
    const m = it.matrix.map(n).join(" ");
    return `<image href="data:${it.mime};base64,${base64(it.bytes)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${m})"${op}>${title}</image>`;
  }
  const stroke = it.stroke ? ` stroke="${paint(it.stroke)}" stroke-width="${n(it.strokeWidth)}"` : "";
  const rule = it.fillRule === "evenodd" ? ` fill-rule="evenodd"` : "";
  return `<path d="${pathData(it.d)}" fill="${paint(it.fill)}"${rule}${stroke}${op}>${title}</path>`;
}

/**
 * SVG 1.1 in millimetres. Layers are groups that Inkscape and Illustrator list
 * as layers. Spot colours use their preview colour (SVG has no spot colours).
 */
export function sceneToSvg(scene: Scene): string {
  const mb = scene.mediaBox;
  const layers = scene.layers
    .map((l) => `<g id="layer-${l.id}" inkscape:groupmode="layer" inkscape:label="${esc(l.name)}">${l.items.map(item).join("")}</g>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" width="${n(mb.width)}mm" height="${n(mb.height)}mm" viewBox="${n(mb.minX)} ${n(mb.minY)} ${n(mb.width)} ${n(mb.height)}">
${layers}
</svg>
`;
}
