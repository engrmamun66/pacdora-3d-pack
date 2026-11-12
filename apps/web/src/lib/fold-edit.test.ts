import { describe, expect, it } from "vitest";
import type { FoldSetup } from "@packaging/dieline-engine";
import { applyFoldSequence, compactOrders, depthOf, linesKey, makeMain, moveHinge, pieceMap, pieceNameOf, pieceOf, rootAt, rootsOf, setGround, setMainName, sortedHinges, stepsOf, updateHinge, updatePanel, updatePartMeta } from "./fold-edit";

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
  it("quick sort: listed lines fold one by one in that order, the rest follow and keep their steps", () => {
    const four: FoldSetup = {
      ...setup,
      hinges: [
        { id: "h1", parentId: "a", childId: "b", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
        { id: "h2", parentId: "b", childId: "c", line: [0, 0, 1, 0], angleDeg: -90, order: 2 },
        { id: "h3", parentId: "a", childId: "c", line: [0, 0, 1, 0], angleDeg: 90, order: 2 },
        { id: "h4", parentId: "a", childId: "c", line: [0, 0, 1, 0], angleDeg: 90, order: 5 },
      ],
    };
    const r = applyFoldSequence(four, ["h4", "h1"]);
    expect(Object.fromEntries(r.hinges.map((h) => [h.id, h.order]))).toEqual({ h4: 1, h1: 2, h2: 3, h3: 3 });
    // unknown and repeated ids are skipped; nothing listed changes nothing
    expect(applyFoldSequence(four, ["zzz", "h2", "h2"]).hinges.find((h) => h.id === "h2")!.order).toBe(1);
    expect(applyFoldSequence(four, [])).toBe(four);
    expect(four.hinges[0]!.order).toBe(1);
  });
});

describe("setGround", () => {
  it("sets, replaces and clears the ground panel", () => {
    expect(setGround(setup, "b").groundId).toBe("b");
    expect(setGround(setGround(setup, "b"), "a").groundId).toBe("a");
    expect("groundId" in setGround(setGround(setup, "b"), null)).toBe(false);
  });
  it("ignores a panel that does not exist", () => {
    expect("groundId" in setGround(setup, "zzz")).toBe(false);
  });
});

describe("two pieces, each with its own steps", () => {
  const two: FoldSetup = {
    rootId: "a",
    panels: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id, label: id, role: "body" as const, printable: true, polygon: sq })),
    hinges: [
      { id: "h1", parentId: "a", childId: "b", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
      { id: "h2", parentId: "a", childId: "c", line: [0, 0, 1, 0], angleDeg: 90, order: 2 },
      { id: "g1", parentId: "x", childId: "y", line: [0, 0, 1, 0], angleDeg: 90, order: 1 },
      { id: "g2", parentId: "x", childId: "z", line: [0, 0, 1, 0], angleDeg: 90, order: 5 },
    ],
    parts: [{ rootId: "x", placement: { mode: "closed" }, name: "Lid" }],
  };
  const orders = (s: FoldSetup) => Object.fromEntries(s.hinges.map((h) => [h.id, h.order]));

  it("knows which piece a panel is in", () => {
    expect([...pieceMap(two)]).toEqual([["a", 0], ["b", 0], ["c", 0], ["x", 1], ["y", 1], ["z", 1]]);
    expect(stepsOf(two, 0)).toEqual([1, 2]);
    expect(stepsOf(two, 1)).toEqual([1, 5]);
    expect(sortedHinges(two, 1).map((h) => h.id)).toEqual(["g1", "g2"]);
  });
  it("moving a line renumbers only its own piece", () => {
    const r = moveHinge(two, "g2", 0);
    expect(orders(r)).toEqual({ h1: 1, h2: 2, g2: 1, g1: 2 });
  });
  it("tidy renumbers each piece from 1", () => expect(orders(compactOrders(two))).toEqual({ h1: 1, h2: 2, g1: 1, g2: 2 }));
  it("quick sort orders each piece on its own", () => {
    const r = applyFoldSequence(two, ["g2", "h2"]);
    expect(orders(r)).toEqual({ h2: 1, h1: 2, g2: 1, g1: 2 });
  });
  it("a typed step may repeat so lines fold together", () => {
    expect(orders(updateHinge(two, "h2", { order: 1 }))).toMatchObject({ h1: 1, h2: 1 });
    expect(stepsOf(updateHinge(two, "h2", { order: 1 }), 0)).toEqual([1]);
  });
  it("names pieces, with defaults", () => {
    expect(pieceNameOf(two, "a")).toBe("Main body");
    expect(pieceNameOf(two, "x")).toBe("Lid");
    expect(pieceNameOf(updatePartMeta(two, "x", { name: "  " }), "x")).toBe("Part 2");
    expect(pieceNameOf(setMainName(two, "Box"), "a")).toBe("Box");
    expect(pieceNameOf(setMainName(setMainName(two, "Box"), ""), "a")).toBe("Main body");
  });
  it("timing is stored only when it is 'after'", () => {
    expect(updatePartMeta(two, "x", { timing: "after" }).parts![0]!.timing).toBe("after");
    expect(updatePartMeta(updatePartMeta(two, "x", { timing: "after" }), "x", { timing: "together" }).parts![0]).not.toHaveProperty("timing");
  });
  it("making the lid the main body swaps names and keeps the references right", () => {
    const named = setMainName(two, "Box");
    const swapped = makeMain(named, "x");
    expect(swapped.rootId).toBe("x");
    expect(swapped.mainName).toBe("Lid");
    expect(swapped.parts![0]!.rootId).toBe("a");
    expect(swapped.parts![0]!.name).toBe("Box");
    expect(pieceNameOf(swapped, "a")).toBe("Box");
    expect(pieceNameOf(swapped, "x")).toBe("Lid");
  });
  it("making the other piece the main body again puts everything back", () => {
    const start: FoldSetup = { ...setMainName(two, "Box"), parts: [{ rootId: "x", name: "Lid", placement: { mode: "beside", side: "back", gap: 12, offset: { z: 5 } }, timing: "after" }] };
    const there = makeMain(start, "x");
    expect(there.rootId).toBe("x");
    const back = makeMain(there, "a");
    expect(back.rootId).toBe("a");
    expect(back.mainName).toBe("Box");
    expect(back.parts![0]).toMatchObject({ rootId: "x", name: "Lid", placement: { mode: "beside", side: "back", gap: 12, offset: { z: 5 } } });
  });
});
