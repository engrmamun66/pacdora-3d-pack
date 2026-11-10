import { describe, expect, it } from "vitest";
import type { FoldSetup } from "@packaging/dieline-engine";
import { compactOrders, depthOf, linesKey, makeMain, moveHinge, pieceOf, rootAt, rootsOf, sortedHinges, stepsOf, updateHinge, updatePanel } from "./fold-edit";

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
  describe("moveHinge", () => {
    const mk = (orders: number[]): FoldSetup => ({
      ...setup,
      hinges: orders.map((order, i) => ({ id: `h${i + 1}`, parentId: "a", childId: "b", line: [0, 0, 1, 0] as [number, number, number, number], angleDeg: 90, order })),
    });
    const seq = (s: FoldSetup) => sortedHinges(s).map((h) => `${h.id}:${h.order}`);
    it("moves a line down and renumbers 1..n", () => {
      expect(seq(moveHinge(mk([1, 2, 3]), "h1", 2))).toEqual(["h2:1", "h3:2", "h1:3"]);
    });
    it("moves a line up", () => {
      expect(seq(moveHinge(mk([1, 2, 3]), "h3", 0))).toEqual(["h3:1", "h1:2", "h2:3"]);
    });
    it("keeps lines that share a step together", () => {
      expect(seq(moveHinge(mk([1, 2, 2, 5]), "h4", 0))).toEqual(["h4:1", "h1:2", "h2:3", "h3:3"]);
    });
    it("joins a step when dropped between two lines of that step", () => {
      expect(seq(moveHinge(mk([1, 2, 2, 3]), "h4", 2))).toEqual(["h1:1", "h2:2", "h3:2", "h4:2"]);
    });
    it("ignores unknown ids and no-op moves, clamps the target", () => {
      const s = mk([1, 2]);
      expect(moveHinge(s, "zzz", 0)).toBe(s);
      expect(moveHinge(s, "h1", 0)).toBe(s);
      expect(seq(moveHinge(s, "h1", 99))).toEqual(["h2:1", "h1:2"]);
    });
  });
  describe("extra parts", () => {
    const two: FoldSetup = {
      rootId: "a",
      panels: ["a", "b", "x", "y", "z"].map((id) => ({ id, label: id, role: "body" as const, printable: true, polygon: sq })),
      hinges: [
        { id: "h1", parentId: "a", childId: "b", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
        { id: "h2", parentId: "x", childId: "y", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
        { id: "h3", parentId: "y", childId: "z", line: [0, 0, 1, 0], angleDeg: 90, order: 2 },
      ],
      parts: [{ rootId: "x", placement: { mode: "open", openDeg: 30 } }],
    };
    it("knows the roots and which piece a panel is in", () => {
      expect(rootsOf(two)).toEqual(["a", "x"]);
      expect(["a", "b", "x", "y", "z"].map((id) => pieceOf(two, id))).toEqual([0, 0, 1, 1, 1]);
    });
    it("measures depth from each piece's own base", () => {
      const d = depthOf(two);
      expect([d.get("a"), d.get("b"), d.get("x"), d.get("y"), d.get("z")]).toEqual([0, 1, 0, 1, 2]);
    });
    it("re-roots a piece inside itself and keeps the part's placement", () => {
      const r = rootAt(two, "z");
      expect(r.rootId).toBe("a");
      expect(r.parts).toEqual([{ rootId: "z", placement: { mode: "open", openDeg: 30 } }]);
      expect(r.hinges.filter((h) => h.id !== "h1").map((h) => [h.id, h.parentId, h.childId])).toEqual([["h2", "y", "x"], ["h3", "z", "y"]]);
      expect(rootAt(two, "x")).toBe(two);
    });
    it("swaps the main body with a part", () => {
      const m = makeMain(two, "x");
      expect(m.rootId).toBe("x");
      expect(m.parts![0]!.rootId).toBe("a");
      expect(makeMain(two, "b")).toBe(two);
    });
  });
});
