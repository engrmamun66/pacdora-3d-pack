import { deflateSync } from "node:zlib";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { setPngDpi } from "./png-dpi";

const tiny = () => {
  const p = new PNG({ width: 2, height: 2 });
  p.data.fill(200);
  return new Uint8Array(PNG.sync.write(p));
};
const phys = (png: Uint8Array) => {
  const s = Buffer.from(png);
  const i = s.indexOf("pHYs");
  return i < 0 ? null : { x: s.readUInt32BE(i + 4), unit: s[i + 12], count: s.toString("latin1").split("pHYs").length - 1 };
};

describe("setPngDpi", () => {
  it("adds a pHYs chunk with pixels per metre and keeps the PNG valid", () => {
    const out = setPngDpi(tiny(), 300);
    expect(phys(out)).toEqual({ x: Math.round(300 / 0.0254), unit: 1, count: 1 });
    const decoded = PNG.sync.read(Buffer.from(out)); // pngjs verifies every chunk CRC
    expect(decoded.width).toBe(2);
  });
  it("replaces an existing pHYs chunk instead of adding a second one", () => {
    const out = setPngDpi(setPngDpi(tiny(), 72), 150);
    expect(phys(out)).toEqual({ x: Math.round(150 / 0.0254), unit: 1, count: 1 });
    expect(PNG.sync.read(Buffer.from(out)).height).toBe(2);
  });
  it("rejects non-PNG input", () => {
    expect(() => setPngDpi(new Uint8Array(deflateSync(Buffer.from("x"))), 300)).toThrow();
  });
});
