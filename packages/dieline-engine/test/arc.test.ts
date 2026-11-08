import { describe, expect, it } from "vitest";
import {
  arcFromBulge,
  bulgeFromRadius,
  bulgeSegmentArea,
  edgeLength,
  flattenEdge,
  flattenOutline,
  outlineArea,
  outlineBounds,
  roundCorners,
  area,
  vec,
} from "../src";

describe("arc edges (bulge)", () => {
  it("a bulge of 1 is a semicircle with the chord as diameter", () => {
    const arc = arcFromBulge(vec(0, 0), vec(10, 0), 1);
    expect(arc.radius).toBeCloseTo(5, 9);
    expect(arc.center.x).toBeCloseTo(5, 9);
    expect(arc.center.y).toBeCloseTo(0, 9);
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI, 9);
    expect(edgeLength(vec(0, 0), vec(10, 0), 1)).toBeCloseTo(5 * Math.PI, 9);
  });

  it("positive bulge puts the arc midpoint on the (d.y, -d.x) side", () => {
    // d = (10, 0) -> side vector (0, -10): midpoint must have negative y.
    expect(arcFromBulge(vec(0, 0), vec(10, 0), 0.5).mid.y).toBeLessThan(0);
    expect(arcFromBulge(vec(0, 0), vec(10, 0), -0.5).mid.y).toBeGreaterThan(0);
  });

  it("semicircle segment area is pi r^2 / 2", () => {
    expect(Math.abs(bulgeSegmentArea(vec(0, 0), vec(10, 0), 1))).toBeCloseTo((Math.PI * 25) / 2, 9);
  });

  it("exact outline area matches a finely flattened polygon", () => {
    // Square 10x10 whose top edge (0,0)->(10,0) bulges outward (negative y side).
    const o = { points: [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], bulges: [0.4, 0, 0, 0] };
    const exact = outlineArea(o);
    const approx = area(flattenOutline(o, 0.0001));
    expect(exact).toBeGreaterThan(100);
    expect(Math.abs(exact - approx)).toBeLessThan(1e-3);
  });

  it("flattened points stay within tolerance of the true arc", () => {
    const a = vec(0, 0);
    const b = vec(20, 0);
    const arc = arcFromBulge(a, b, 0.3);
    const pts = flattenEdge(a, b, 0.3, 0.01);
    for (const p of pts) expect(Math.abs(Math.hypot(p.x - arc.center.x, p.y - arc.center.y) - arc.radius)).toBeLessThan(1e-9);
    // Chord midpoints of consecutive points deviate at most the tolerance.
    let prev = a;
    for (const p of pts) {
      const m = vec((prev.x + p.x) / 2, (prev.y + p.y) / 2);
      expect(arc.radius - Math.hypot(m.x - arc.center.x, m.y - arc.center.y)).toBeLessThanOrEqual(0.01 + 1e-12);
      prev = p;
    }
  });

  it("bulgeFromRadius produces the requested radius", () => {
    const b = bulgeFromRadius(8, 5, 1);
    expect(arcFromBulge(vec(0, 0), vec(8, 0), b).radius).toBeCloseTo(5, 9);
  });

  it("outline bounds include arc extremes between vertices", () => {
    const o = { points: [vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)], bulges: [1, 0, 0, 0] };
    const bb = outlineBounds(o);
    expect(bb.min.y).toBeCloseTo(-5, 9); // semicircle above the square (negative y)
  });
});

describe("roundCorners (fillets)", () => {
  const rect = [vec(0, 0), vec(40, 0), vec(40, 20), vec(0, 20)];

  it("rounds two corners with the exact area loss r^2 (1 - pi/4) each", () => {
    const r = 5;
    const o = roundCorners(rect, [0, 0, r, r]);
    expect(outlineArea(o)).toBeCloseTo(800 - 2 * r * r * (1 - Math.PI / 4), 9);
  });

  it("keeps the bounding box when fillets are inside the corners", () => {
    const o = roundCorners(rect, [4, 4, 4, 4]);
    const bb = outlineBounds(o);
    expect(bb.min.x).toBeCloseTo(0, 9);
    expect(bb.max.x).toBeCloseTo(40, 9);
    expect(bb.min.y).toBeCloseTo(0, 9);
    expect(bb.max.y).toBeCloseTo(20, 9);
  });

  it("rejects radii that do not fit", () => {
    // Side edges are 20 mm long; a 21 mm fillet cannot fit on them.
    expect(() => roundCorners(rect, [0, 0, 21, 0])).toThrow(/too large/);
    // Two 11 mm fillets need 22 mm on the 20 mm edge between vertices 1 and 2.
    expect(() => roundCorners(rect, [0, 11, 11, 0])).toThrow(/too large/);
    // 11 mm on non-adjacent ends of the 40 mm edge fits.
    expect(() => roundCorners(rect, [0, 0, 11, 11])).not.toThrow();
  });

  it("a full half-round end (two fillets meeting) works", () => {
    const o = roundCorners(rect, [0, 0, 10, 10]);
    expect(outlineArea(o)).toBeCloseTo(800 - 2 * 100 * (1 - Math.PI / 4), 9);
  });
});
