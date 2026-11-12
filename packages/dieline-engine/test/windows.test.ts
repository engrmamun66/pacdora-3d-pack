import { describe, expect, it } from "vitest";
import {
  WINDOW_GAP,
  WINDOW_MARGIN,
  WINDOW_SHAPES,
  applyWindows,
  area,
  bounds,
  flattenOutline,
  generateDieline,
  windowPolygon,
  type WindowSpec,
} from "../src";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const polyOf = (p: (typeof geo.foldTree.panels)[number]) => flattenOutline({ points: p.polygon, ...(p.bulges ? { bulges: p.bulges } : {}) });
/** The biggest body panel and its centre. */
const big = [...geo.foldTree.panels].filter((p) => p.role === "body").sort((a, b) => area(polyOf(b)) - area(polyOf(a)))[0]!;
const bb = bounds(polyOf(big));
const centre = { x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2 };
const win = (over: Partial<WindowSpec> = {}): WindowSpec => ({ id: "w1", shape: "rectangle", cx: centre.x, cy: centre.y, width: 20, height: 30, rotation: 0, ...over });

describe("window shapes", () => {
  it("every shape fills its box exactly (before rotation) and stays one simple polygon", () => {
    for (const shape of WINDOW_SHAPES) {
      const p = windowPolygon(win({ shape, cx: 0, cy: 0, width: 40, height: 24 }));
      const b = bounds(p);
      expect(b.max.x - b.min.x, shape).toBeCloseTo(40, 0);
      expect(b.max.y - b.min.y, shape).toBeCloseTo(24, 0);
      expect(area(p), shape).toBeGreaterThan(40 * 24 * 0.2);
      expect(area(p), shape).toBeLessThanOrEqual(40 * 24 + 1e-6);
    }
  });

  it("areas of the basic shapes are right", () => {
    expect(area(windowPolygon(win({ cx: 0, cy: 0 })))).toBeCloseTo(600, 6);
    expect(area(windowPolygon(win({ shape: "ellipse", cx: 0, cy: 0, width: 20, height: 20 })))).toBeCloseTo(Math.PI * 100, 0);
    expect(area(windowPolygon(win({ shape: "diamond", cx: 0, cy: 0 })))).toBeCloseTo(300, 6);
  });

  it("a rotation keeps the size and moves the box", () => {
    const a = windowPolygon(win({ cx: 5, cy: 5 }));
    const b = windowPolygon(win({ cx: 5, cy: 5, rotation: 37 }));
    expect(area(b)).toBeCloseTo(area(a), 6);
    const bx = bounds(windowPolygon(win({ cx: 0, cy: 0, rotation: 90 })));
    expect(bx.max.x - bx.min.x).toBeCloseTo(30, 6);
    expect(bx.max.y - bx.min.y).toBeCloseTo(20, 6);
  });
});

describe("applyWindows", () => {
  it("cuts a window inside a panel: a hole in the panel and one more cut loop", () => {
    const r = applyWindows(geo, [win()]);
    expect(r.problems).toEqual([]);
    expect(r.applied).toEqual(["w1"]);
    expect(r.geo.cutLoops).toHaveLength(geo.cutLoops.length + 1);
    expect(r.geo.foldTree.panels.find((p) => p.id === big.id)!.holes).toHaveLength(1);
    expect(r.panelOf.w1).toBe(big.id);
    expect(r.geo.checks.some((c) => c.name === "Window holes" && c.pass)).toBe(true);
    // The input is not changed.
    expect(geo.cutLoops).toHaveLength(r.geo.cutLoops.length - 1);
    expect(geo.foldTree.panels.every((p) => !p.holes)).toBe(true);
  });

  it("no windows: the same geometry back", () => {
    expect(applyWindows(geo, []).geo).toBe(geo);
  });

  it("leaves out a window that crosses a fold or sticks out, and says why", () => {
    const across = applyWindows(geo, [win({ cx: bb.max.x, width: 20 })]);
    expect(across.applied).toEqual([]);
    expect(across.problems[0]!.id).toBe("w1");
    expect(across.geo).toBe(geo);
    const off = applyWindows(geo, [win({ cx: -500, cy: -500 })]);
    expect(off.problems[0]!.message).toMatch(/Not on the dieline/);
  });

  it("keeps the margin to the panel's edges", () => {
    const nearEdge = win({ cx: bb.min.x + 10 + WINDOW_MARGIN / 2, width: 20 });
    expect(applyWindows(geo, [nearEdge]).problems[0]!.message).toMatch(/Too close to the edge/);
    expect(applyWindows(geo, [win({ cx: bb.min.x + 10 + WINDOW_MARGIN + 0.5, width: 20 })]).problems).toEqual([]);
  });

  it("keeps a gap between windows: the second one is left out, the first stays", () => {
    const a = win({ id: "a", cx: centre.x - 12, width: 10, height: 10 });
    const b = win({ id: "b", cx: centre.x - 12 + 10 + WINDOW_GAP / 2, width: 10, height: 10 });
    const r = applyWindows(geo, [a, b]);
    expect(r.applied).toEqual(["a"]);
    expect(r.problems.map((p) => p.id)).toEqual(["b"]);
  });

  it("rejects numbers that make no sense", () => {
    expect(applyWindows(geo, [win({ width: 1 })]).problems[0]!.message).toMatch(/Too small/);
    expect(applyWindows(geo, [win({ cx: Number.NaN })]).problems[0]!.message).toMatch(/not a number/);
    expect(applyWindows(geo, [{ ...win(), shape: "blob" as never }]).problems[0]!.message).toMatch(/Unknown shape/);
  });

  it("a hole in every panel is allowed, several in one panel too", () => {
    const r = applyWindows(geo, [win({ id: "a", cx: centre.x - 20, width: 10, height: 10 }), win({ id: "b", cx: centre.x + 20, width: 10, height: 10 })]);
    expect(r.applied).toEqual(["a", "b"]);
    expect(r.geo.foldTree.panels.find((p) => p.id === big.id)!.holes).toHaveLength(2);
  });
});
