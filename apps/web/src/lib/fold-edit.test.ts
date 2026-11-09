import { describe, expect, it } from "vitest";
import type { FoldSetup } from "@packaging/dieline-engine";
import { compactOrders, depthOf, linesKey, rootAt, stepsOf, updateHinge, updatePanel } from "./fold-edit";

const sq = [0, 0, 10, 0, 10, 10, 0, 10];
const setup: FoldSetup = {
  rootId: "a",
  panels: ["a", "b", "c"].map((id) => ({ id, label: id, role: "body" as const, printable: true, polygon: sq })),
  hinges: [
    { id: "h1", parentId: "a", childId: "b", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
    { id: "h2", parentId: "b", childId: "c", line: [0, 0, 1, 0], angleDeg: -90, order: 3 },
  ],
};

describe("fold edits", () => {
  it("re-roots a chain by turning hinges around", () => {
    const r = rootAt(setup, "c");
    expect(r.rootId).toBe("c");
    expect(r.hinges.map((h) => [h.id, h.parentId, h.childId])).toEqual([["h1", "b", "a"], ["h2", "c", "b"]]);
    expect(depthOf(r).get("a")).toBe(2);
    expect(rootAt(setup, "a")).toBe(setup);
    expect(rootAt(setup, "zzz")).toBe(setup);
  });
  it("updates panels and hinges without touching the original", () => {
    expect(updatePanel(setup, "b", { label: "Front" }).panels[1]!.label).toBe("Front");
    expect(updateHinge(setup, "h1", { angleDeg: 45 }).hinges[0]!.angleDeg).toBe(45);
    expect(setup.hinges[0]!.angleDeg).toBe(90);
  });
  it("lists and compacts fold steps", () => {
    expect(stepsOf(setup)).toEqual([1, 3]);
    expect(compactOrders(setup).hinges.map((h) => h.order)).toEqual([1, 2]);
  });
  it("linesKey changes when the lines change", () => {
    const a = { cut: [{ pts: [0, 0, 1, 1], closed: false }], crease: [] };
    expect(linesKey(a)).toBe(linesKey({ ...a }));
    expect(linesKey(a)).not.toBe(linesKey({ cut: [{ pts: [0, 0, 1, 2], closed: false }], crease: [] }));
  });
});
