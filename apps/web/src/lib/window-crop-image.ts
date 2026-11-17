import { traceMask, type FittedLoops } from "@packaging/dieline-engine";

/**
 * "Dynamic Crop": a PNG or SVG picture whose filled part becomes the hole of a window.
 * The picture is drawn on a small canvas (the browser loads an SVG as a picture, so nothing in it can run), turned into a
 * black and white grid, and the engine finds the outline of the filled part (`traceMask`).
 * Filled = the picture's own opaque pixels; a picture with no transparency at all counts its non-white pixels instead.
 */

export const CROP_MAX_BYTES = 5_000_000;
/** The longest side of the grid the picture is drawn on. */
const GRID = 320;

export class CropImageError extends Error {}

export interface TracedCrop {
  readonly name: string;
  readonly fitted: FittedLoops;
}

const isPng = (f: File) => f.type === "image/png" || /\.png$/i.test(f.name);
const isSvg = (f: File) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name);

/** An SVG made safe to draw: scripts and outside links are never run when it is loaded as a picture, but it needs a size. */
async function svgBlob(file: File): Promise<Blob> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new CropImageError("This SVG file cannot be read.");
  const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0;
  const size = (name: string) => {
    const n = parseFloat(root.getAttribute(name) ?? "");
    return Number.isFinite(n) && n > 0 && !(root.getAttribute(name) ?? "").includes("%") ? n : null;
  };
  let w = size("width") ?? (hasBox ? vb[2]! : 300);
  let h = size("height") ?? (hasBox ? vb[3]! : 300);
  const k = 1024 / Math.max(w, h);
  w *= k;
  h *= k;
  root.setAttribute("width", String(w));
  root.setAttribute("height", String(h));
  if (!hasBox) root.setAttribute("viewBox", `0 0 ${w / k} ${h / k}`);
  return new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" });
}

const load = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new CropImageError("This picture cannot be opened."));
    };
    img.src = url;
  });

export async function traceCropFile(file: File): Promise<TracedCrop> {
  if (!isPng(file) && !isSvg(file)) throw new CropImageError("Use a PNG or an SVG file.");
  if (file.size > CROP_MAX_BYTES) throw new CropImageError("The file is too big (up to 5 MB).");
  const img = await load(isSvg(file) ? await svgBlob(file) : file);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) throw new CropImageError("This picture has no size.");
  const k = GRID / Math.max(nw, nh);
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new CropImageError("This browser cannot read the picture.");
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let transparent = false;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i]! < 250) {
      transparent = true;
      break;
    }
  }
  // One empty cell all around, so a picture that reaches its edge still has a closed outline.
  const W = w + 2;
  const mask = new Uint8Array(W * (h + 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const filled = transparent ? px[i + 3]! >= 128 : px[i + 3]! >= 128 && 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]! < 235;
      if (filled) mask[(y + 1) * W + x + 1] = 1;
    }
  }
  const fitted = traceMask(mask, W, h + 2);
  if (!fitted) throw new CropImageError("No filled area found in this picture. Use a picture with a solid shape on a clear or white background.");
  return { name: file.name.replace(/\.(png|svg)$/i, "").slice(0, 40) || "Crop", fitted };
}
