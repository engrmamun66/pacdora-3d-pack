import { describe, expect, it } from "vitest";
import { validateFoldSetup, type FoldSetup } from "@packaging/dieline-engine";
import { mergePanels, splitPanel } from "./panel-edit";

const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
const area = (poly: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    s += poly[i]! * poly[j + 1]! - poly[j]! * poly[i + 1]!;
  }
  return Math.abs(s) / 2;
};
const panel = (id: string, poly: number[]) => ({ id, label: `Panel ${id.slice(1)}`, role: "body" as const, printable: true, polygon: poly });

/** Three panels in a row: p1 (base) - p2 - p3, each 100 x 50. */
const row = (): FoldSetup => ({
  rootId: "p1",
  panels: [panel("p1", rect(0, 0, 100, 50)), panel("p2", rect(100, 0, 200, 50)), panel("p3", rect(200, 0, 300, 50))],
  hinges: [
    { id: "h1", parentId: "p1", childId: "p2", line: [100, 0, 100, 50], angleDeg: 90, order: 1 },
    { id: "h2", parentId: "p2", childId: "p3", line: [200, 0, 200, 50], angleDeg: 90, order: 2 },
  ],
});

describe("mergePanels", () => {
  it("joins the two panels of a fold line; what hung off the child now hangs off the merged panel", () => {
    const r = mergePanels(row(), "h1");
    expect(r.error).toBeUndefined();
    const s = r.setup!;
    expect(s.panels.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(area(s.panels[0]!.polygon)).toBeCloseTo(10000, 6);
    expect(s.hinges).toHaveLength(1);
    expect(s.hinges[0]).toMatchObject({ id: "h2", parentId: "p1", childId: "p3", order: 1 });
    expect(validateFoldSetup(s)).toEqual([]);
  });

  it("joins a small flap to a bigger panel along part of its edge", () => {
    const setup: FoldSetup = {
      rootId: "p1",
      panels: [panel("p1", rect(0, 0, 100, 100)), panel("p2", rect(100, 20, 200, 80))],
      hinges: [{ id: "h1", parentId: "p1", childId: "p2", line: [100, 20, 100, 80], angleDeg: 90, order: 1 }],
    };
    const r = mergePanels(setup, "h1");
    expect(r.error).toBeUndefined();
    expect(r.setup!.panels).toHaveLength(1);
    expect(area(r.setup!.panels[0]!.polygon)).toBeCloseTo(10000 + 6000, 6);
    expect(r.setup!.hinges).toHaveLength(0);
  });

  it("keeps the ends of the other fold lines as corners of the merged panel", () => {
    const r = mergePanels(row(), "h1");
    const poly = r.setup!.panels[0]!.polygon;
    const has = (x: number, y: number) => poly.some((_, i) => i % 2 === 0 && poly[i] === x && poly[i + 1] === y);
    expect(has(200, 0)).toBe(true);
    expect(has(200, 50)).toBe(true);
  });

  it("says so when the fold line is gone", () => {
    expect(mergePanels(row(), "nope").error).toMatch(/not there/);
  });
});

describe("splitPanel", () => {
  it("cuts a panel into two joined by a new fold line", () => {
    const r = splitPanel(row(), "p2", [150, 20], [150, 30]);
    expect(r.error).toBeUndefined();
    const s = r.setup!;
    expect(s.panels).toHaveLength(4);
    const kept = s.panels.find((p) => p.id === "p2")!;
    const added = s.panels.find((p) => p.id === "p4")!;
    expect(area(kept.polygon) + area(added.polygon)).toBeCloseTo(5000, 6);
    expect(area(kept.polygon)).toBeCloseTo(2500, 6);
    // p2 hangs on p1 by its left side, so the left half keeps the name; the right half hangs off it, and p3 now hangs off the right half.
    expect(Math.min(...kept.polygon.filter((_, i) => i % 2 === 0))).toBe(100);
    expect(Math.max(...kept.polygon.filter((_, i) => i % 2 === 0))).toBeCloseTo(150, 6);
    const hNew = s.hinges.find((h) => h.childId === "p4")!;
    expect(hNew).toMatchObject({ parentId: "p2", angleDeg: 90 });
    expect(hNew.line.map((v) => Math.round(v * 1000) / 1000)).toEqual([150, 0, 150, 50]);
    expect(s.hinges.find((h) => h.id === "h2")).toMatchObject({ parentId: "p4", childId: "p3" });
    // folding order: p2 (1), then the new fold (2), then p3 (3).
    expect(s.hinges.find((h) => h.id === "h1")!.order).toBe(1);
    expect(hNew.order).toBe(2);
    expect(s.hinges.find((h) => h.id === "h2")!.order).toBe(3);
    expect(validateFoldSetup(s)).toEqual([]);
  });

  it("a base panel keeps its name on the bigger piece", () => {
    const r = splitPanel(row(), "p1", [30, 10], [30, 40]);
    const s = r.setup!;
    expect(s.rootId).toBe("p1");
    expect(area(s.panels.find((p) => p.id === "p1")!.polygon)).toBeCloseTo(70 * 50, 6);
    expect(s.hinges.find((h) => h.id === "h1")).toMatchObject({ parentId: "p1" });
    expect(validateFoldSetup(s)).toEqual([]);
  });

  it("a slanted cut works, and the pieces add up", () => {
    const r = splitPanel(row(), "p3", [250, 25], [260, 35]);
    expect(r.error).toBeUndefined();
    const s = r.setup!;
    expect(s.panels).toHaveLength(4);
    expect(area(s.panels.find((p) => p.id === "p3")!.polygon) + area(s.panels.find((p) => p.id === "p4")!.polygon)).toBeCloseTo(5000, 6);
    expect(validateFoldSetup(s)).toEqual([]);
  });

  it("a cut that ends in the middle of one of the panel's fold lines cuts that fold line short", () => {
    const setup: FoldSetup = {
      rootId: "p1",
      panels: [panel("p1", rect(0, 0, 100, 100)), panel("p2", rect(20, 100, 80, 150))],
      hinges: [{ id: "h1", parentId: "p1", childId: "p2", line: [20, 100, 80, 100], angleDeg: 90, order: 1 }],
    };
    const r = splitPanel(setup, "p1", [30, 50], [30, 60]);
    expect(r.error).toBeUndefined();
    const s = r.setup!;
    const h1 = s.hinges.find((h) => h.id === "h1")!;
    // The cut at x = 30 leaves 10 mm of the fold line on the left piece and 50 mm on the right: the long part stays.
    expect(Math.hypot(h1.line[2] - h1.line[0], h1.line[3] - h1.line[1])).toBeCloseTo(50, 6);
    expect(validateFoldSetup(s)).toEqual([]);
  });

  it("refuses a start point outside the panel", () => {
    expect(splitPanel(row(), "p2", [50, 25], [60, 25]).error).toMatch(/inside a panel/);
  });

  it("split then merge gives the panel back", () => {
    const cut = splitPanel(row(), "p2", [150, 20], [150, 30]).setup!;
    const back = mergePanels(cut, cut.hinges.find((h) => h.childId === "p4")!.id);
    expect(back.error).toBeUndefined();
    expect(back.setup!.panels.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(area(back.setup!.panels[1]!.polygon)).toBeCloseTo(5000, 6);
    expect(back.setup!.hinges.map((h) => `${h.parentId}>${h.childId}:${h.order}`)).toEqual(["p1>p2:1", "p2>p3:2"]);
  });
});
