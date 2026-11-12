import { describe, expect, it } from "vitest";
import { boxOf, snapMove, windowGaps, type P } from "./window-guides";

const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe("windowGaps", () => {
  it("measures from the panel's left and top edge to the window", () => {
    const g = windowGaps(rect(100, 50, 300, 250), rect(130, 80, 170, 140));
    expect(g.left).toEqual({ from: 100, to: 130, y: 110 });
    expect(g.top).toEqual({ from: 50, to: 80, x: 150 });
  });
  it("uses the edge of an L-shaped panel at the window's height", () => {
    const L: P[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 60, y: 100 }, { x: 60, y: 200 }, { x: 0, y: 200 }];
    const g = windowGaps(L, rect(20, 120, 50, 150));
    expect(g.left?.from).toBe(0);
    expect(g.top).toEqual({ from: 0, to: 120, x: 35 });
  });
});

describe("snapMove", () => {
  const other = boxOf(rect(100, 100, 140, 160));
  it("snaps a near edge or middle to another window and returns the guide", () => {
    const r = snapMove(boxOf(rect(102, 200, 142, 230)), [other], null, 4);
    expect(r.dx).toBeCloseTo(-2, 6); // left edges line up
    expect(r.guides.some((g) => g.x1 === 100 && g.x2 === 100)).toBe(true);
  });
  it("snaps the middle to the middle of the panel", () => {
    const r = snapMove(boxOf(rect(44, 10, 58, 20)), [], boxOf(rect(0, 0, 100, 100)), 4);
    expect(r.dx).toBeCloseTo(-1, 6);
    expect(r.dy).toBe(0);
  });
  it("does nothing when everything is farther than the threshold", () => {
    const r = snapMove(boxOf(rect(300, 300, 320, 320)), [other], boxOf(rect(0, 0, 100, 100)), 4);
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
