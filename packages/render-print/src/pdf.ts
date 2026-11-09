import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from "pdf-lib";
import { type Matrix, type Paint, type PathCmd, type Scene, type SceneItem, mul } from "@packaging/vector-scene";
import { pngToRgbOnWhite, rgbToPng } from "./raster";

export interface PdfOptions {
  readonly pdfVersion: "1.3" | "1.4" | "1.5" | "1.7";
  /** Write layers as PDF optional content (needs PDF 1.5+). */
  readonly layers: boolean;
  /** "flatten": no transparency in the file (PDF 1.3). */
  readonly transparency: "live" | "flatten";
  readonly title?: string;
  readonly creator?: string;
}

export interface PdfResult {
  readonly bytes: Uint8Array;
  readonly losses: readonly string[];
}

export const MM_TO_PT = 72 / 25.4;

const num = (v: number) => {
  const r = Math.round(v * 1e5) / 1e5;
  return Object.is(r, -0) ? "0" : String(r);
};

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function pathOps(d: readonly PathCmd[]): string {
  return d
    .map((c) =>
      c.op === "M" ? `${num(c.x)} ${num(c.y)} m` : c.op === "L" ? `${num(c.x)} ${num(c.y)} l` : c.op === "C" ? `${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)} c` : "h",
    )
    .join("\n");
}

/**
 * Vector PDF of a scene. Page = scene media box; TrimBox = cut size; BleedBox
 * = bleed. Die lines use Separation (spot) colours set to overprint, so they
 * never knock out the artwork. Text is already outlined in the scene, so no
 * fonts are embedded.
 */
export async function sceneToPdf(scene: Scene, opts: PdfOptions): Promise<PdfResult> {
  const losses: string[] = [];
  const doc = await PDFDocument.create({ updateMetadata: false });
  if (opts.title) doc.setTitle(opts.title);
  doc.setCreator(opts.creator ?? "Dieline Studio");
  doc.setProducer("Dieline Studio PDF writer (pdf-lib)");

  const mb = scene.mediaBox;
  const W = mb.width * MM_TO_PT;
  const H = mb.height * MM_TO_PT;
  const page = doc.addPage([W, H]);
  const box = (b: Scene["trimBox"]) => [(b.minX - mb.minX) * MM_TO_PT, (mb.minY + mb.height - (b.minY + b.height)) * MM_TO_PT, b.width * MM_TO_PT, b.height * MM_TO_PT] as const;
  page.setTrimBox(...box(scene.trimBox));
  page.setBleedBox(...box(scene.bleedBox));

  const ctx = doc.context;
  const colorSpaces = ctx.obj({}) as PDFDict;
  const extG = ctx.obj({}) as PDFDict;
  const xobjects = ctx.obj({}) as PDFDict;
  const properties = ctx.obj({}) as PDFDict;

  const spotNames = new Map<string, string>();
  const spot = (p: Extract<Paint, { kind: "spot" }>) => {
    let n = spotNames.get(p.name);
    if (!n) {
      n = `CS${spotNames.size}`;
      const fn = ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [...p.cmyk], N: 1 });
      colorSpaces.set(PDFName.of(n), ctx.obj([PDFName.of("Separation"), PDFName.of(p.name), PDFName.of("DeviceCMYK"), fn]));
      spotNames.set(p.name, n);
    }
    return n;
  };
  const gsNames = new Map<string, string>();
  const gs = (key: string, entries: Record<string, unknown>) => {
    let n = gsNames.get(key);
    if (!n) {
      n = `GS${gsNames.size}`;
      extG.set(PDFName.of(n), ctx.obj({ Type: "ExtGState", ...entries } as never));
      gsNames.set(key, n);
    }
    return n;
  };

  let warnedOpacity = false;
  let warnedAlpha = false;
  const opacityOp = (o: number) => {
    if (o >= 1) return "";
    if (opts.transparency === "flatten") {
      if (!warnedOpacity) losses.push(`PDF ${opts.pdfVersion} has no transparency: semi-transparent objects are drawn fully opaque.`);
      warnedOpacity = true;
      return "";
    }
    const v = Math.round(o * 1000) / 1000;
    return `/${gs(`a${v}`, { ca: v, CA: v })} gs\n`;
  };

  const fillOp = (p: Paint) => (p.kind === "rgb" ? `${hexRgb(p.hex).map(num).join(" ")} rg` : `/${spot(p)} cs 1 scn`);
  const strokeOp = (p: Paint) => (p.kind === "rgb" ? `${hexRgb(p.hex).map(num).join(" ")} RG` : `/${spot(p)} CS 1 SCN`);

  let imageCount = 0;
  // The same image placed many times is stored once in the file.
  const embedded = new Map<Uint8Array, string>();
  const drawItem = async (it: SceneItem): Promise<string> => {
    if (it.kind === "image") {
      let name = embedded.get(it.bytes);
      if (!name) {
        let img;
        if (it.mime === "image/jpeg") img = await doc.embedJpg(it.bytes);
        else if (opts.transparency === "flatten") {
          const flat = pngToRgbOnWhite(it.bytes);
          if (flat.hadAlpha && !warnedAlpha) {
            losses.push(`PDF ${opts.pdfVersion} has no transparency: transparent image areas are filled with white.`);
            warnedAlpha = true;
          }
          img = await doc.embedPng(rgbToPng(flat));
        } else img = await doc.embedPng(it.bytes);
        name = `Im${imageCount++}`;
        xobjects.set(PDFName.of(name), img.ref);
        embedded.set(it.bytes, name);
      }
      // PDF images fill the unit square with their top row at v = 1; ours has v down.
      const m: Matrix = mul(it.matrix, [1, 0, 0, -1, 0, 1]);
      const clip = it.clip ? `${num(it.clip.minX)} ${num(it.clip.minY)} ${num(it.clip.width)} ${num(it.clip.height)} re W n\n` : "";
      return `q\n${clip}${opacityOp(it.opacity)}${m.map(num).join(" ")} cm\n/${name} Do\nQ`;
    }
    const parts = ["q", opacityOp(it.opacity)];
    if (it.stroke?.kind === "spot") parts.push(`/${gs("overprint", { OP: true, op: true, OPM: 1 })} gs`);
    if (it.fill) parts.push(fillOp(it.fill));
    if (it.stroke) parts.push(strokeOp(it.stroke), `${num(it.strokeWidth)} w`);
    parts.push(pathOps(it.d));
    const evenodd = it.fillRule === "evenodd";
    parts.push(it.fill && it.stroke ? (evenodd ? "B*" : "B") : it.fill ? (evenodd ? "f*" : "f") : it.stroke ? "S" : "n");
    parts.push("Q");
    return parts.filter(Boolean).join("\n");
  };

  const useLayers = opts.layers;
  if (!useLayers && scene.layers.length > 1) losses.push(`PDF ${opts.pdfVersion} has no layers: all content is on one layer (in the original order).`);
  const ocgRefs: PDFRef[] = [];
  const content: string[] = [`q\n${num(MM_TO_PT)} 0 0 ${num(-MM_TO_PT)} ${num(-mb.minX * MM_TO_PT)} ${num((mb.minY + mb.height) * MM_TO_PT)} cm`];
  for (const [i, layer] of scene.layers.entries()) {
    if (useLayers) {
      const ref = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of(layer.name) }));
      ocgRefs.push(ref);
      properties.set(PDFName.of(`OC${i}`), ref);
      content.push(`/OC /OC${i} BDC`);
    }
    for (const it of layer.items) content.push(await drawItem(it));
    if (useLayers) content.push("EMC");
  }
  content.push("Q");

  const res = page.node.Resources() ?? (ctx.obj({}) as PDFDict);
  if (spotNames.size) res.set(PDFName.of("ColorSpace"), colorSpaces);
  if (gsNames.size) res.set(PDFName.of("ExtGState"), extG);
  if (imageCount) res.set(PDFName.of("XObject"), xobjects);
  if (ocgRefs.length) res.set(PDFName.of("Properties"), properties);
  page.node.set(PDFName.of("Resources"), res);

  const stream = ctx.flateStream(content.join("\n"));
  page.node.addContentStream(ctx.register(stream));

  if (ocgRefs.length) {
    const ocgs = ctx.obj(ocgRefs) as PDFArray;
    doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: ocgs, D: ctx.obj({ Order: ocgs, ON: ocgs }) }));
  }
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
  // pdf-lib always writes "%PDF-1.7"; the version string has the same length, so offsets stay valid.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  if (head !== "%PDF-1.7") throw new Error(`Unexpected PDF header ${head}`);
  bytes.set(new TextEncoder().encode(`%PDF-${opts.pdfVersion}`), 0);
  return { bytes, losses };
}
