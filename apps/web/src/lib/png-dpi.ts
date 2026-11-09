const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Set a PNG's physical resolution (pHYs chunk) so print software reads the
 * intended DPI. Replaces an existing pHYs chunk; inserts one after IHDR otherwise.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => png[i] === b)) throw new Error("Not a PNG.");
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let i = 8;
  let inserted = false;
  while (i < png.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (type !== "pHYs") parts.push(png.subarray(i, end));
    if (type === "IHDR" && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    i = end;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
