/** Pixel size of a PNG or JPEG from its header (no decoding). */
export function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (bytes.length < 24) return null;
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      const len = dv.getUint16(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Largest image accepted (decoding allocates width x height x 4 bytes). */
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_SIDE = 12_000;

/** Reason an image of this size is refused, or null if it is acceptable. */
export function imageSizeProblem(size: { width: number; height: number } | null): string | null {
  if (!size || size.width < 1 || size.height < 1) return "the image header is unreadable";
  if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) return `images may be at most ${MAX_IMAGE_SIDE} px on a side`;
  if (size.width * size.height > MAX_IMAGE_PIXELS) return `images may have at most ${MAX_IMAGE_PIXELS / 1e6} megapixels`;
  return null;
}
