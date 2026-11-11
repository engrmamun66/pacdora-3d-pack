import { describe, expect, it } from "vitest";
import { flattenOutline, generateDieline, layoutWatermark, watermarkTile, type WatermarkSpec } from "../src";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const spec: WatermarkSpec = { text: "pacdorabd.com", textColor: "#6b7280", lineColor: "#6b7280", fontSize: 3.6, lineWidth: 0.25 };

const inside = (x: number, y: number) => {
  let r = false;
  for (const ring of geo.cutLoops.map((l) => flattenOutline(l, 0.05))) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) r = !r;
    }
  }
  return r;
};

describe("watermark layout", () => {
  const layout = layoutWatermark(geo, spec);

  it("puts texts and lines on the sheet", () => {
    expect(layout.texts.length).toBeGreaterThan(5);
    expect(layout.lines.length).toBeGreaterThan(5);
  });

  it("keeps every whole text inside the cut area", () => {
    for (const t of layout.texts) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) expect(inside(t.x + (dx * t.width) / 2, t.y + dy * 1.5)).toBe(true);
    }
  });

  it("keeps the lines inside the cut area", () => {
    for (const [x1, y1, x2, y2] of layout.lines) expect(inside((x1 + x2) / 2, (y1 + y2) / 2)).toBe(true);
  });

  it("texts sit on lattice crossings", () => {
    const { w, h } = layout.tile;
    for (const t of layout.texts) {
      const onCorner = Math.abs(t.x / w - Math.round(t.x / w)) < 1e-9 && Math.abs(t.y / h - Math.round(t.y / h)) < 1e-9;
      const onMiddle = Math.abs(t.x / w - 0.5 - Math.round(t.x / w - 0.5)) < 1e-9 && Math.abs(t.y / h - 0.5 - Math.round(t.y / h - 0.5)) < 1e-9;
      expect(onCorner || onMiddle).toBe(true);
    }
  });

  it("no lines when the thickness is 0, nothing when the text is empty", () => {
    expect(layoutWatermark(geo, { ...spec, lineWidth: 0 }).lines).toHaveLength(0);
    const none = layoutWatermark(geo, { ...spec, text: "  " });
    expect(none.texts).toHaveLength(0);
    expect(none.lines).toHaveLength(0);
  });

  it("bigger text spaces out", () => {
    expect(watermarkTile("pacdorabd.com", 7.2).w).toBeGreaterThan(watermarkTile("pacdorabd.com", 3.6).w * 1.5);
  });
});
