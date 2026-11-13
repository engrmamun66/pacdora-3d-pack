import { describe, expect, it } from "vitest";
import {
  WINDOW_GAP,
  WINDOW_MARGIN,
  WINDOW_SHAPES,
  WINDOW_SHAPE_GROUPS,
  WINDOW_SHAPE_LABELS,
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
      expect(area(p), shape).toBeGreaterThan(40 * 24 * 0.1);
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

describe("pieces and holes the drawing already has", () => {
  const b0 = bounds(flattenOutline(geo.cutLoops[0]!));
  const rect = (x0: number, y0: number, x1: number, y1: number) => ({ points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });

  it("a second piece (its own outline, e.g. a lid beside the box) is not a hole", () => {
    const withPiece = { ...geo, cutLoops: [...geo.cutLoops, rect(b0.max.x + 20, b0.min.y, b0.max.x + 120, b0.min.y + 80)] };
    expect(applyWindows(withPiece, [win()]).problems).toEqual([]);
  });

  it("a window inside the second piece is judged on its own panels, not blocked by the outline", () => {
    const withPiece = { ...geo, cutLoops: [...geo.cutLoops, rect(b0.max.x + 20, b0.min.y, b0.max.x + 120, b0.min.y + 80)] };
    expect(applyWindows(withPiece, [win()]).applied).toEqual(["w1"]);
  });

  it("a hole inside an outline still keeps windows clear", () => {
    const hole = rect(centre.x - 5, centre.y - 5, centre.x + 5, centre.y + 5);
    const r = applyWindows({ ...geo, cutLoops: [...geo.cutLoops, hole] }, [win({ width: 8, height: 8 })]);
    expect(r.problems[0]?.message).toMatch(/hole the dieline already has/);
  });
});

describe("the shape library", () => {
  type P = { x: number; y: number };
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  /** Do the segments ab and cd cross (a touch at an end does not count)? */
  const crosses = (a: P, b: P, c: P, d: P) => cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9;
  const isSimple = (pts: readonly P[]) => {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
        if (crosses(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return false;
      }
    }
    return true;
  };

  it("has Basic Shapes and 50 More Shapes, each named once", () => {
    expect(WINDOW_SHAPE_GROUPS.map((g) => [g.title, g.shapes.length])).toEqual([["Basic Shapes", 16], ["More Shapes", 50]]);
    expect(WINDOW_SHAPES.length).toBe(66);
    const labels = WINDOW_SHAPES.map((s) => WINDOW_SHAPE_LABELS[s]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(WINDOW_SHAPES.flatMap((s) => (s.length <= 30 ? [s] : []))).size).toBe(66); // ids fit the stored form
  });

  it("every shape is one simple polygon that fills its box, wide, tall and square", () => {
    for (const shape of WINDOW_SHAPES) {
      for (const [w, h] of [[60, 30], [30, 60], [40, 40]] as const) {
        const p = windowPolygon(win({ shape, cx: 0, cy: 0, width: w, height: h }));
        const b = bounds(p);
        expect(b.max.x - b.min.x, `${shape} width`).toBeCloseTo(w, 0);
        expect(b.max.y - b.min.y, `${shape} height`).toBeCloseTo(h, 0);
        expect(area(p), `${shape} area`).toBeGreaterThan(w * h * 0.08);
        expect(isSimple(p), `${shape} ${w}x${h} crosses itself`).toBe(true);
      }
    }
  });

  it("every shape can be cut into a panel, and rotated", () => {
    for (const shape of WINDOW_SHAPES) {
      for (const rotation of [0, 35]) {
        const r = applyWindows(geo, [win({ shape, width: 16, height: 16, rotation })]);
        expect(r.problems, `${shape} rotated ${rotation}`).toEqual([]);
        expect(r.applied).toEqual(["w1"]);
      }
    }
  });
});
