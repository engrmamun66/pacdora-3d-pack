import { describe, expect, it } from "vitest";
import { dragEnd, extendEnd, lengthOf, segmentsOf } from "./fold-line-edit";

const square = segmentsOf([{ pts: [0, 0, 100, 0, 100, 100, 0, 100], closed: true }]);

describe("fold line editing", () => {
  it("drags an end along the line's own direction only", () => {
    // A vertical line at x = 50; the pointer is off to the side: x stays 50, only y follows.
    const out = dragEnd([50, 20, 50, 60], "end", { x: 90, y: 80 }, [], 0);
    expect(out).toEqual([50, 20, 50, 80]);
  });

  it("never turns the line and keeps the other end where it is", () => {
    const out = dragEnd([10, 10, 30, 30], "start", { x: 0, y: 10 }, [], 0);
    expect(out.slice(2)).toEqual([30, 30]);
    // still on the same diagonal
    expect(out[0]! - out[1]!).toBeCloseTo(0, 9);
  });

  it("keeps a minimum length and does not flip the line over", () => {
    const out = dragEnd([50, 20, 50, 60], "end", { x: 50, y: -40 }, [], 0, 2);
    expect(out).toEqual([50, 20, 50, 22]);
  });

  it("snaps to the outline when the pointer is close to it", () => {
    expect(dragEnd([50, 20, 50, 60], "end", { x: 50, y: 97 }, square, 5)).toEqual([50, 20, 50, 100]);
    expect(dragEnd([50, 20, 50, 60], "end", { x: 50, y: 90 }, square, 5)).toEqual([50, 20, 50, 90]);
  });

  it("extends an end to the first line ahead of it, and reports when there is none", () => {
    expect(extendEnd([50, 20, 50, 60], "end", square)).toEqual([50, 20, 50, 100]);
    expect(extendEnd([50, 20, 50, 60], "start", square)).toEqual([50, 0, 50, 60]);
    expect(extendEnd([50, 20, 50, 60], "end", [])).toBeNull();
  });

  it("measures the length of a line", () => {
    expect(lengthOf([0, 0, 3, 4])).toBe(5);
    expect(lengthOf([0, 0, 3, 4, 3, 10])).toBe(11);
  });
});
