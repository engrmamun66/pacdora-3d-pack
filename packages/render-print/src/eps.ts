import { deflateSync } from "node:zlib";
import type { Paint, PathCmd, Scene, SceneItem } from "@packaging/vector-scene";
import { MM_TO_PT } from "./pdf";
import { pngToRgbOnWhite } from "./raster";

export interface EpsOptions {
  readonly psLevel: 2 | 3;
  readonly title?: string;
  readonly creator?: string;
}

const num = (v: number) => {
  const r = Math.round(v * 1e5) / 1e5;
  return Object.is(r, -0) ? "0" : String(r);
};
/** PostScript string literal. */
const psString = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?")})`;

/** ASCII85 (Adobe), terminated with "~>", wrapped at 76 columns. */
export function ascii85(bytes: Uint8Array): string {
  let out = "";
  let line = 0;
  const push = (s: string) => {
    for (const ch of s) {
      out += ch;
      if (++line === 76) {
        out += "\n";
        line = 0;
      }
    }
  };
  for (let i = 0; i < bytes.length; i += 4) {
    const n = Math.min(4, bytes.length - i);
    let v = 0;
    for (let j = 0; j < 4; j++) v = v * 256 + (j < n ? bytes[i + j]! : 0);
    if (v === 0 && n === 4) {
      push("z");
      continue;
    }
    const digits: string[] = [];
    for (let j = 0; j < 5; j++) {
      digits.unshift(String.fromCharCode((v % 85) + 33));
      v = Math.floor(v / 85);
    }
    push(digits.slice(0, n + 1).join(""));
  }
  return `${out}~>`;
}

/** PostScript RunLengthDecode encoding (Level 2), with EOD marker. */
export function runLength(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    let run = 1;
    while (i + run < bytes.length && run < 128 && bytes[i + run] === bytes[i]) run++;
    if (run >= 2) {
      out.push(257 - run, bytes[i]!);
      i += run;
      continue;
    }
    const start = i;
    while (i < bytes.length && i - start < 128 && !(i + 1 < bytes.length && bytes[i + 1] === bytes[i])) i++;
    if (i === start) i++;
    out.push(i - start - 1, ...bytes.subarray(start, i));
  }
  out.push(128);
  return new Uint8Array(out);
}

function jpegComponents(bytes: Uint8Array): number {
  let i = 2;
  while (i + 9 < bytes.length) {
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return bytes[i + 9]!;
    i += 2 + len;
  }
  return 3;
}

function pathOps(d: readonly PathCmd[]): string {
  return d
    .map((c) => (c.op === "M" ? `${num(c.x)} ${num(c.y)} m` : c.op === "L" ? `${num(c.x)} ${num(c.y)} l` : c.op === "C" ? `${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)} c` : "h"))
    .join("\n");
}

/**
 * Encapsulated PostScript (EPSF 3.0, DSC 3.0) of a scene. EPS has no layers
 * and no transparency: content is written in layer order, opacity is ignored
 * and transparent image areas are composited onto white (all reported).
 */
export function sceneToEps(scene: Scene, opts: EpsOptions): { bytes: Uint8Array; losses: string[] } {
  const losses: string[] = [];
  const mb = scene.mediaBox;
  const W = mb.width * MM_TO_PT;
  const H = mb.height * MM_TO_PT;
  const spots = new Map<string, Extract<Paint, { kind: "spot" }>>();
  for (const l of scene.layers) for (const it of l.items) if (it.kind === "path") for (const p of [it.fill, it.stroke]) if (p?.kind === "spot") spots.set(p.name, p);

  let opacityWarned = false;
  let alphaWarned = false;
  const color = (p: Paint) => {
    if (p.kind === "rgb") {
      const v = parseInt(p.hex.slice(1), 16);
      return `${num(((v >> 16) & 255) / 255)} ${num(((v >> 8) & 255) / 255)} ${num((v & 255) / 255)} setrgbcolor`;
    }
    const [c, m, y, k] = p.cmyk;
    return `[/Separation ${psString(p.name)} cvn /DeviceCMYK {dup ${num(c)} mul exch dup ${num(m)} mul exch dup ${num(y)} mul exch ${num(k)} mul}] setcolorspace 1 setcolor`;
  };

  const body: string[] = [];
  const item = (it: SceneItem) => {
    if (it.opacity < 1 && !opacityWarned) {
      losses.push("EPS has no transparency: semi-transparent objects are drawn fully opaque.");
      opacityWarned = true;
    }
    if (it.kind === "image") {
      let filters: string;
      let data: Uint8Array;
      let w = it.pxWidth;
      let h = it.pxHeight;
      let cs = "/DeviceRGB";
      let decode = "[0 1 0 1 0 1]";
      if (it.mime === "image/jpeg") {
        const n = jpegComponents(it.bytes);
        cs = n === 1 ? "/DeviceGray" : n === 4 ? "/DeviceCMYK" : "/DeviceRGB";
        decode = n === 1 ? "[0 1]" : n === 4 ? "[1 0 1 0 1 0 1 0]" : decode; // Adobe CMYK JPEGs are inverted
        data = it.bytes;
        filters = "/ASCII85Decode filter /DCTDecode filter";
      } else {
        const img = pngToRgbOnWhite(it.bytes);
        if (img.hadAlpha && !alphaWarned) {
          losses.push("EPS has no transparency: transparent image areas are filled with white.");
          alphaWarned = true;
        }
        w = img.width;
        h = img.height;
        if (opts.psLevel === 3) {
          data = new Uint8Array(deflateSync(img.rgb));
          filters = "/ASCII85Decode filter /FlateDecode filter";
        } else {
          data = runLength(img.rgb);
          filters = "/ASCII85Decode filter /RunLengthDecode filter";
        }
      }
      // Image space row 0 is the top row; our frame is y-down, so the scene matrix applies directly.
      body.push(
        `gsave\n${it.clip ? `newpath ${num(it.clip.minX)} ${num(it.clip.minY)} moveto ${num(it.clip.width)} 0 rlineto 0 ${num(it.clip.height)} rlineto ${num(-it.clip.width)} 0 rlineto closepath clip newpath\n` : ""}[${it.matrix.map(num).join(" ")}] concat\n${cs} setcolorspace\n<< /ImageType 1 /Width ${w} /Height ${h} /BitsPerComponent 8 /Decode ${decode} /ImageMatrix [${w} 0 0 ${h} 0 0] /DataSource currentfile ${filters} >> image\n${ascii85(data)}\ngrestore`,
      );
      return;
    }
    const parts = ["gsave", "newpath", pathOps(it.d)];
    const fillCmd = it.fillRule === "evenodd" ? "eofill" : "fill";
    if (it.fill && it.stroke) parts.push(`gsave ${color(it.fill)} ${fillCmd} grestore`);
    else if (it.fill) parts.push(`${color(it.fill)} ${fillCmd}`);
    if (it.stroke) {
      if (it.stroke.kind === "spot") parts.push("true setoverprint");
      parts.push(`${color(it.stroke)} ${num(it.strokeWidth)} setlinewidth stroke`);
    }
    parts.push("grestore");
    body.push(parts.join("\n"));
  };
  for (const l of scene.layers) {
    body.push(`% Layer: ${l.name.replace(/[\r\n]/g, " ")}`);
    l.items.forEach(item);
  }
  if (scene.layers.length > 1) losses.push("EPS has no layers: all content is on one layer (in the original order).");

  const date = new Date().toISOString().slice(0, 19).replace("T", " ");
  const header = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`,
    `%%HiResBoundingBox: 0 0 ${num(W)} ${num(H)}`,
    `%%Creator: ${(opts.creator ?? "Dieline Studio").replace(/[\r\n]/g, " ")}`,
    `%%Title: ${(opts.title ?? "Dieline").replace(/[^\x20-\x7e]/g, "?")}`,
    `%%CreationDate: ${date}`,
    `%%LanguageLevel: ${opts.psLevel}`,
    "%%DocumentData: Clean7Bit",
    "%%DocumentProcessColors: Cyan Magenta Yellow Black",
    ...(spots.size ? [`%%DocumentCustomColors: ${[...spots.keys()].map(psString).join(" ")}`] : []),
    ...[...spots.values()].map((s) => `%%CMYKCustomColor: ${s.cmyk.map(num).join(" ")} ${psString(s.name)}`),
    "%%Pages: 1",
    "%%EndComments",
    "%%BeginProlog",
    "/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def /h {closepath} bind def",
    "%%EndProlog",
    "%%Page: 1 1",
    "save",
    // mm, y down -> points, y up
    `[${num(MM_TO_PT)} 0 0 ${num(-MM_TO_PT)} ${num(-mb.minX * MM_TO_PT)} ${num((mb.minY + mb.height) * MM_TO_PT)}] concat`,
    "0 setlinejoin 0 setlinecap 10 setmiterlimit",
  ];
  const trailer = ["restore", "showpage", "%%Trailer", "%%EOF", ""];
  return { bytes: new TextEncoder().encode([...header, ...body, ...trailer].join("\n")), losses };
}
