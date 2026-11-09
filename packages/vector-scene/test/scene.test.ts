import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import type { Artwork, ArtworkObject } from "@packaging/schema";
import { buildScene, dielineToDxf, layoutTextbox, outlinePath, pathBounds, sceneToSvg } from "../src";
import { nodeFontSource } from "../src/node";
import { makePng, testImages } from "./fixtures";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const common = { panelId: "front", dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false } as const;
const text = (over: Partial<ArtworkObject> = {}): ArtworkObject =>
  ({ ...common, id: "t", name: "Title", type: "text", text: "Hello Box", fontFamily: "Inter", fontSizePt: 24, fontWeight: "bold", fontStyle: "normal", textAlign: "center", lineHeight: 1.16, width: 80, fill: "#112233", ...over }) as ArtworkObject;
const src = { fonts: nodeFontSource, images: testImages({ img1: makePng(40, 20) }) };

describe("text layout mirrors the editor's Textbox rules", () => {
  const mono = (s: string) => s.length; // 1 mm per character
  it("wraps greedily on spaces and aligns lines", () => {
    const l = layoutTextbox("aaa bbb ccc", { width: 7, fontSize: 10, lineHeight: 1, align: "center" }, mono);
    expect(l.lines.map((x) => x.text)).toEqual(["aaa bbb", "ccc"]);
    expect(l.lines[1]!.x).toBeCloseTo(-7 / 2 + (7 - 3) / 2, 9);
  });
  it("widens the box to the longest word", () => {
    const l = layoutTextbox("abcdefghij x", { width: 4, fontSize: 10, lineHeight: 1, align: "left" }, mono);
    expect(l.width).toBe(10);
    expect(l.lines.map((x) => x.text)).toEqual(["abcdefghij", "x"]);
  });
  it("uses 1.13 x size line boxes and keeps hard breaks", () => {
    const l = layoutTextbox("a\n\nb", { width: 10, fontSize: 10, lineHeight: 1.5, align: "left" }, mono);
    expect(l.lines).toHaveLength(3);
    expect(l.height).toBeCloseTo(2 * 11.3 * 1.5 + 11.3, 9);
    expect(l.lines[0]!.baseline).toBeCloseTo(-l.height / 2 + 11.3 * (1 - 0.222), 9);
    expect(l.lines[2]!.baseline - l.lines[1]!.baseline).toBeCloseTo(11.3 * 1.5, 9);
  });
});

describe("arc conversion", () => {
  it("cubic arcs stay on the circle (rounded tuck corners)", () => {
    const tuck = geo.foldTree.panels.find((p) => p.id === "top-tuck")!;
    const d = outlinePath({ points: tuck.polygon, bulges: tuck.bulges });
    expect(d.some((c) => c.op === "C")).toBe(true);
    const b = pathBounds(d);
    // The tuck is 100 wide; control points never leave its box by more than a hair.
    expect(b.maxX - b.minX).toBeLessThanOrEqual(100 + 1e-6);
  });
});

describe("scene", () => {
  it("contains artwork and die lines in the expected layers and boxes", async () => {
    const art: Artwork = { objects: [text(), { ...common, id: "i", name: "Logo", type: "image", assetId: "img1", width: 40, height: 20, flipX: false, flipY: false, angle: 90 }] };
    const s = await buildScene(geo, art, src);
    expect(s.layers.map((l) => l.id)).toEqual(["artwork", "crease", "cut"]);
    expect(s.trimBox.width).toBeCloseTo(geo.cutBounds.max.x - geo.cutBounds.min.x, 9);
    expect(s.mediaBox.width).toBeCloseTo(geo.bleedBounds.max.x - geo.bleedBounds.min.x, 9);
    const artLayer = s.layers[0]!;
    expect(artLayer.items).toHaveLength(2);
    const t = artLayer.items[0]!;
    expect(t.kind === "path" && t.d.length > 50).toBe(true);
    // The text is centred on the front panel centre.
    const front = geo.foldTree.panels.find((p) => p.id === "front")!;
    const fx = (Math.min(...front.polygon.map((p) => p.x)) + Math.max(...front.polygon.map((p) => p.x))) / 2;
    if (t.kind === "path") {
      const b = pathBounds(t.d);
      expect(Math.abs((b.minX + b.maxX) / 2 - fx)).toBeLessThan(1); // glyph side bearings make it ~centred
    }
    // A 90° rotated 40 x 20 image: unit square corner (0,0) -> centre + R90 * (-20, -10)
    const img = artLayer.items[1]!;
    expect(img.kind).toBe("image");
    if (img.kind === "image") {
      expect(img.pxWidth).toBe(40);
      const [a, b, c, d, e, f] = img.matrix;
      expect(a).toBeCloseTo(0, 9);
      expect(b).toBeCloseTo(40, 9);
      expect(c).toBeCloseTo(-20, 9);
      expect(d).toBeCloseTo(0, 9);
      expect(e).toBeCloseTo(fx + 10, 6);
      expect(f).toBeDefined();
    }
    expect(s.losses).toEqual([]);
  });

  it("reports characters the font cannot draw and missing images", async () => {
    const s = await buildScene(geo, { objects: [text({ text: "চা Tea" }), { ...common, id: "x", name: "Gone", type: "image", assetId: "nope", width: 10, height: 10, flipX: false, flipY: false }] }, src);
    expect(s.losses.join(" ")).toMatch(/2 character\(s\) are not in the font Inter/);
    expect(s.losses.join(" ")).toMatch(/Image "Gone" is missing/);
  });

  it("reports a substituted style (Oswald has no italic)", async () => {
    const s = await buildScene(geo, { objects: [text({ fontFamily: "Oswald", fontStyle: "italic" })] }, src);
    expect(s.losses.join(" ")).toMatch(/Oswald bold italic is not available/);
  });

  it("skips hidden objects", async () => {
    const s = await buildScene(geo, { objects: [text({ visible: false })] }, src);
    expect(s.layers[0]!.items).toHaveLength(0);
  });

  it("dimension layer enlarges the page", async () => {
    const s = await buildScene(geo, { objects: [] }, src, { dimensions: true, bleedGuide: true, safeGuide: true, glueAreas: true });
    expect(s.layers.map((l) => l.id)).toEqual(["glue", "artwork", "bleed", "safe", "crease", "cut", "dimensions"]);
    expect(s.mediaBox.width).toBeGreaterThan(s.bleedBox.width);
  });
});

describe("SVG export", () => {
  it("is millimetre-sized with the page as viewBox and named layers", async () => {
    const s = await buildScene(geo, { objects: [text()] }, src);
    const svg = sceneToSvg(s);
    const vb = svg.match(/viewBox="([^"]+)"/)![1]!.split(" ").map(Number);
    expect(vb[2]).toBeCloseTo(s.mediaBox.width, 3);
    expect(vb[3]).toBeCloseTo(s.mediaBox.height, 3);
    expect(svg).toContain(`width="${Math.round(s.mediaBox.width * 1e4) / 1e4}mm"`);
    expect(svg).toContain('inkscape:label="Cut"');
    expect(svg).toContain('stroke="#e6007e"');
  });
});

describe("DXF export", () => {
  it("has CUT and CREASE entities whose extents equal the cut size", () => {
    const dxf = dielineToDxf(geo);
    const lines = dxf.split("\r\n");
    const xs: number[] = [];
    const ys: number[] = [];
    let polylines = 0;
    let lineEntities = 0;
    let bulges = 0;
    for (let i = 0; i < lines.length - 1; i += 2) {
      const code = lines[i]!.trim();
      const v = lines[i + 1]!;
      if (code === "0" && v === "POLYLINE") polylines++;
      if (code === "0" && v === "LINE") lineEntities++;
      if (code === "42") bulges++;
      if (["10", "11"].includes(code)) xs.push(Number(v));
      if (["20", "21"].includes(code)) ys.push(Number(v));
    }
    expect(dxf.startsWith("0\r\nSECTION")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(polylines).toBe(geo.cutLoops.length);
    expect(lineEntities).toBe(geo.slitLines.length + geo.creaseLines.length);
    expect(bulges).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(geo.cutBounds.max.x - geo.cutBounds.min.x, 6);
    expect(Math.max(...ys)).toBeCloseTo(geo.cutBounds.max.y - geo.cutBounds.min.y, 6);
  });
});

describe("box background", () => {
  const bg = { assetId: "img1", fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 0.8 } as const;

  it("is the first artwork item, clipped to the print area, and appears in the SVG", async () => {
    const s = await buildScene(geo, { objects: [text()], background: bg }, src);
    const items = s.layers[0]!.items;
    expect(items).toHaveLength(2);
    const first = items[0]!;
    expect(first.kind).toBe("image");
    if (first.kind === "image") {
      expect(first.opacity).toBe(0.8);
      expect(first.clip).toEqual({ minX: s.bleedBox.minX, minY: s.bleedBox.minY, width: s.bleedBox.width, height: s.bleedBox.height });
      // cover: at least as large as the print area on both axes
      expect(first.matrix[0]).toBeGreaterThanOrEqual(s.bleedBox.width - 1e-6);
      expect(Math.abs(first.matrix[3])).toBeGreaterThanOrEqual(s.bleedBox.height - 1e-6);
    }
    const svg = sceneToSvg(s);
    expect(svg).toContain('<clipPath id="clip-image">');
    expect(svg.indexOf("<image")).toBeLessThan(svg.indexOf("<path"));
  });

  it("is skipped with a note when the file is missing, and with artwork off", async () => {
    const miss = await buildScene(geo, { objects: [], background: { ...bg, assetId: "gone" } }, src);
    expect(miss.layers[0]!.items).toHaveLength(0);
    expect(miss.losses.join(" ")).toMatch(/box background/i);
    const off = await buildScene(geo, { objects: [], background: bg }, src, { artwork: false });
    expect(off.layers.find((l) => l.id === "artwork")).toBeUndefined();
  });
});
