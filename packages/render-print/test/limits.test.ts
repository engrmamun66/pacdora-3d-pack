import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import type { ArtworkObject } from "@packaging/schema";
import { buildScene } from "@packaging/vector-scene";
import { nodeFontSource } from "@packaging/vector-scene/node";
import { pngToRgbOnWhite, sceneToPdf } from "../src";
import { makePng, testImages } from "./fixtures";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const img = (id: string, assetId: string): ArtworkObject => ({ panelId: "front", dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false, id, name: id, type: "image", assetId, width: 20, height: 10, flipX: false, flipY: false });

/** A valid small PNG whose header claims a huge size (decompression-bomb shape). */
function bombPng(w: number, h: number): Uint8Array {
  const png = makePng(4, 4);
  const dv = new DataView(png.buffer, png.byteOffset);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return png;
}

describe("image limits", () => {
  it("refuses an image that declares too many pixels, without decoding it", async () => {
    const bomb = bombPng(60000, 60000);
    expect(() => pngToRgbOnWhite(bomb)).toThrow(/Image refused/);
    const scene = await buildScene(geo, { objects: [img("a", "bomb")] }, { fonts: nodeFontSource, images: testImages({ bomb }) });
    expect(scene.layers[0]!.items).toHaveLength(0);
    expect(scene.losses.join(" ")).toMatch(/Image "a" was left out: images may be at most 12000 px/);
  });

  it("refuses 11000 x 11000 (121 MP, under the side limit but over the pixel limit)", async () => {
    const scene = await buildScene(geo, { objects: [img("a", "big")] }, { fonts: nodeFontSource, images: testImages({ big: bombPng(11000, 11000) }) });
    expect(scene.losses.join(" ")).toMatch(/megapixels/);
  });

  it("stores one image once in the PDF however often it is placed", async () => {
    const png = makePng(16, 16);
    const objects = Array.from({ length: 50 }, (_, i) => img(`i${i}`, "same"));
    const scene = await buildScene(geo, { objects }, { fonts: nodeFontSource, images: testImages({ same: png }) });
    expect(scene.layers[0]!.items).toHaveLength(50);
    const { bytes } = await sceneToPdf(scene, { pdfVersion: "1.7", layers: true, transparency: "live" });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.match(/\/Subtype \/Image/g)?.length).toBe(2); // the image + its soft mask (alpha channel)
    expect(text.match(/\/Im1\b/)).toBeNull(); // no second copy was registered
  });
});
