import { describe, expect, it } from "vitest";
import { MAX_BACKGROUND_TILES, backgroundTiles, type BackgroundPlacement } from "../src";

/** A print area of 100 x 60 at the origin, and a picture of w x h centred on (cx, cy). */
const placement = (cx: number, cy: number, width: number, height: number): BackgroundPlacement => ({ cx, cy, width, height, clip: { minX: 0, minY: 0, width: 100, height: 60 } });

const covers = (tiles: { cx: number; cy: number; width: number; height: number }[], x: number, y: number) => tiles.some((t) => x >= t.cx - t.width / 2 && x <= t.cx + t.width / 2 && y >= t.cy - t.height / 2 && y <= t.cy + t.height / 2);

describe("backgroundTiles", () => {
  it("gives just the placement without repeat", () => {
    const p = placement(50, 30, 20, 20);
    expect(backgroundTiles(p, "none")).toEqual([{ cx: 50, cy: 30, width: 20, height: 20 }]);
  });

  it("keeps the placement as one of the copies and covers the whole print area when it repeats both ways", () => {
    const p = placement(37, 11, 20, 15);
    const tiles = backgroundTiles(p, "both")!;
    expect(tiles).toContainEqual({ cx: 37, cy: 11, width: 20, height: 15 });
    for (let x = 0; x <= 100; x += 2.5) for (let y = 0; y <= 60; y += 2.5) expect(covers(tiles, x, y)).toBe(true);
  });

  it("makes no copy that lies wholly outside the print area", () => {
    const tiles = backgroundTiles(placement(50, 30, 20, 20), "both")!;
    for (const t of tiles) {
      expect(t.cx + t.width / 2).toBeGreaterThan(0);
      expect(t.cx - t.width / 2).toBeLessThan(100);
      expect(t.cy + t.height / 2).toBeGreaterThan(0);
      expect(t.cy - t.height / 2).toBeLessThan(60);
    }
  });

  it("repeats only across for x and only down for y", () => {
    const across = backgroundTiles(placement(50, 30, 20, 20), "x")!;
    expect(new Set(across.map((t) => t.cy))).toEqual(new Set([30]));
    expect(across.map((t) => t.cx)).toEqual([10, 30, 50, 70, 90]); // edges that only touch the print area are not drawn
    const down = backgroundTiles(placement(50, 30, 20, 20), "y")!;
    expect(new Set(down.map((t) => t.cx))).toEqual(new Set([50]));
  });

  it("lays copies exactly one width and one height apart", () => {
    const tiles = backgroundTiles(placement(50, 30, 20, 15), "both")!;
    const xs = [...new Set(tiles.map((t) => t.cx))].sort((a, b) => a - b);
    const ys = [...new Set(tiles.map((t) => t.cy))].sort((a, b) => a - b);
    xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeCloseTo(20, 9));
    ys.slice(1).forEach((y, i) => expect(y - ys[i]!).toBeCloseTo(15, 9));
  });

  it("returns null when too many copies would be needed, and survives a zero size", () => {
    expect(backgroundTiles(placement(50, 30, 1, 1), "both")).toBeNull();
    expect(100 * 60).toBeGreaterThan(MAX_BACKGROUND_TILES);
    expect(backgroundTiles(placement(50, 30, 0, 10), "both")).toEqual([{ cx: 50, cy: 30, width: 0, height: 10 }]);
  });
});
