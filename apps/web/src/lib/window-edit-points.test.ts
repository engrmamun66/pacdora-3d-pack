import { describe, expect, it } from "vitest";
import { applyWindows, area, generateDieline, windowHoles, type WindowSpec } from "@packaging/dieline-engine";
import { anchorsOf, windowFromAnchors } from "./window-edit-points";
import { flattenPath, moveAnchor, setHandle } from "./window-pen";

const win = (over: Partial<WindowSpec> = {}): WindowSpec => ({ id: "w1", shape: "rectangle", cx: 100, cy: 80, width: 40, height: 20, rotation: 0, ...over });

describe("edit points", () => {
  it("opens a rectangle as its four corners and gives the same window back", () => {
    const a = anchorsOf(win())!;
    expect(a).toHaveLength(4);
    const back = windowFromAnchors(a, 3);
    if (!("window" in back)) throw new Error(back.error);
    expect(back.window).toMatchObject({ cx: 100, cy: 80, width: 40, height: 20, rotation: 0, shape: "custom" });
    expect(area(windowHoles({ ...win(), ...back.window })[0]!)).toBeCloseTo(800, 3);
  });

  it("opens a circle as four smooth points whose curves are a circle", () => {
    const a = anchorsOf(win({ shape: "circle", width: 30, height: 30 }))!;
    expect(a).toHaveLength(4);
    expect(a.every((p) => p.smooth && p.hin && p.hout)).toBe(true);
    const poly = flattenPath(a, true);
    let sum = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      sum += p.x * q.y - q.x * p.y;
    }
    expect(Math.abs(sum / 2)).toBeCloseTo(Math.PI * 225, -1);
  });

  it("keeps a turned window where it is and bakes the turn in", () => {
    const turned = win({ rotation: 90 });
    const a = anchorsOf(turned)!;
    const xs = a.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 6); // the 40 x 20 box lies on its side
    const back = windowFromAnchors(a, 3);
    if (!("window" in back)) throw new Error(back.error);
    expect(back.window.rotation).toBe(0);
    expect(back.window.width).toBeCloseTo(20, 3);
    expect(back.window.height).toBeCloseTo(40, 3);
  });

  it("an edited path is stored in the box and opens again with its handles", () => {
    const a = anchorsOf(win())!;
    const bent = setHandle(setHandle(moveAnchor(a, 0, { x: a[0]!.x - 4, y: a[0]!.y }), 0, "hout", { x: a[0]!.x + 8, y: a[0]!.y - 12 }), 1, "hin", { x: a[1]!.x - 8, y: a[1]!.y - 12 });
    const back = windowFromAnchors(bent, 3);
    if (!("window" in back)) throw new Error(back.error);
    const stored: WindowSpec = { id: "w1", ...back.window };
    expect(stored.path).toHaveLength(4);
    const again = anchorsOf(stored)!;
    expect(again).toHaveLength(4);
    bent.forEach((p, i) => {
      expect(again[i]!.x).toBeCloseTo(p.x, 2);
      expect(again[i]!.y).toBeCloseTo(p.y, 2);
      expect(Boolean(again[i]!.hout)).toBe(Boolean(p.hout));
    });
  });

  it("has nothing to edit for a grid or a shape of several pieces, and refuses a crossing path", () => {
    expect(anchorsOf(win({ shape: "grid" }))).toBeNull();
    expect(anchorsOf(win({ shape: "custom", loops: [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5], [0, 0, 0.1, 0, 0.1, 0.1]] }))).toBeNull();
    const a = anchorsOf(win())!;
    const crossing = [a[0]!, a[2]!, a[1]!, a[3]!];
    expect("error" in windowFromAnchors(crossing, 3)).toBe(true);
  });

  it("an edited window is cut like any other", () => {
    const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
    const front = geo.foldTree.panels.find((p) => p.role === "body")!;
    const xs = front.polygon.map((p) => p.x);
    const ys = front.polygon.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const a = anchorsOf({ shape: "circle", cx, cy, width: 20, height: 20, rotation: 0 })!;
    const back = windowFromAnchors(a, 3);
    if (!("window" in back)) throw new Error(back.error);
    const r = applyWindows(geo, [{ id: "w1", ...back.window }]);
    expect(r.problems).toEqual([]);
    expect(r.applied).toEqual(["w1"]);
  });
});
