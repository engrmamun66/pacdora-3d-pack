/**
 * Identify an uploaded image by its first bytes (never trust the browser's
 * MIME type or the file name). Only PNG and JPEG are accepted: SVG can carry
 * scripts, and the print exporters (PDF, AI, EPS) embed PNG/JPEG natively.
 */
export type ImageType = { mime: "image/png" | "image/jpeg"; ext: "png" | "jpg" };

export function sniffImage(bytes: Uint8Array): ImageType | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
