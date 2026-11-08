import { describe, expect, it } from "vitest";
import { area, bounds, offsetPolygon, signedArea, simplifyCollinear, vec } from "../src";

const square = (s: number) => [vec(0, 0), vec(s, 0), vec(s, s), vec(0, s)];

describe("polygon primitives", () => {
  it("computes area independent of winding", () => {
    expect(area(square(10))).toBeCloseTo(100, 9);
    expect(area([...square(10)].reverse())).toBeCloseTo(100, 9);
    expect(signedArea(square(10))).toBeCloseTo(-signedArea([...square(10)].reverse()), 9);
  });

  it("computes bounds", () => {
    expect(bounds(square(10))).toEqual({ min: vec(0, 0), max: vec(10, 10) });
  });

  it("removes collinear and duplicate vertices", () => {
    const poly = [vec(0, 0), vec(5, 0), vec(10, 0), vec(10, 10), vec(10, 10), vec(0, 10)];
    expect(simplifyCollinear(poly)).toHaveLength(4);
  });

  it("grows a square by the offset on every side (mitered)", () => {
    const [r] = offsetPolygon(square(10), 3);
    expect(bounds(r!)).toEqual({ min: vec(-3, -3), max: vec(13, 13) });
    expect(area(r!)).toBeCloseTo(256, 6);
  });

  it("grows the same way regardless of input winding", () => {
    const [r] = offsetPolygon([...square(10)].reverse(), 3);
    expect(area(r!)).toBeCloseTo(256, 6);
  });

  it("shrinks with a negative offset", () => {
    const [r] = offsetPolygon(square(10), -2);
    expect(area(r!)).toBeCloseTo(36, 6);
  });

  it("returns nothing when shrunk past collapse", () => {
    expect(offsetPolygon(square(10), -6)).toHaveLength(0);
  });

  it("merges a slit narrower than twice the offset instead of self-intersecting", () => {
    // U shape with a 2 mm wide, 20 mm deep slot; offset 3 must fill the slot.
    const u = [vec(0, 0), vec(10, 0), vec(10, 30), vec(6, 30), vec(6, 10), vec(4, 10), vec(4, 30), vec(0, 30)];
    const r = offsetPolygon(u, 3);
    expect(r).toHaveLength(1);
    // Slot (2 x 20 = 40 mm2) is bridged, so area exceeds plain-perimeter growth of the unslotted outline minus nothing.
    expect(area(r[0]!)).toBeGreaterThan(area(u) + 40);
  });
});
