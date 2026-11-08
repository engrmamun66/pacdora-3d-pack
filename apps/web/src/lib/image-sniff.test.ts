import { describe, expect, it } from "vitest";
import { sniffImage } from "./image-sniff";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("sniffImage", () => {
  it("recognises PNG, JPEG and WebP by magic bytes", () => {
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))?.mime).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8 "))?.mime).toBe("image/webp");
  });

  it("rejects SVG, HTML, GIF, empty and truncated input", () => {
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBeNull();
    expect(sniffImage(bytes("<!doctype html>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes(0x89, "PN"))).toBeNull();
  });
});
