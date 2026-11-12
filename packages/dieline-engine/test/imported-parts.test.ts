import { describe, expect, it } from "vitest";
import {
  type FlatDieline,
  type FlatPath,
  type FoldSetup,
  type FoldTree,
  createImportedGenerator,
  detectFoldSetup,
  flatPoint,
  foldTree,
  partFits,
  foldWindows,
  stagedHingeProgress,
  importedCutSize,
  importedDefaults,
  scaleImportedPaths,
  transformPoint,
  validateFoldSetup,
} from "../src";

const closed = (...xy: number[]): FlatPath => ({ pts: xy, closed: true });
const line = (...xy: number[]): FlatPath => ({ pts: xy, closed: false });

/** An open box as a cross: centre c x c at (ox + w, oy + w), four walls w high. */
function cross(ox: number, oy: number, c: number, w: number): { cut: FlatPath; crease: FlatPath[] } {
  const x0 = ox, x1 = ox + w, x2 = ox + w + c, x3 = ox + 2 * w + c;
  const y0 = oy, y1 = oy + w, y2 = oy + w + c, y3 = oy + 2 * w + c;
  return {
    cut: closed(x1, y0, x2, y0, x2, y1, x3, y1, x3, y2, x2, y2, x2, y3, x1, y3, x1, y2, x0, y2, x0, y1, x1, y1),
    crease: [line(x1, y1, x2, y1), line(x2, y1, x2, y2), line(x2, y2, x1, y2), line(x1, y2, x1, y1)],
  };
}

/** A 40 x 40 x 30 tray with a 44 x 44 x 15 lid drawn 150 mm to its right. */
const base = cross(0, 0, 40, 30);
const lid = cross(150, 0, 44, 15);
const BOX_AND_LID: FlatDieline = { cut: [base.cut, lid.cut], crease: [...base.crease, ...lid.crease], bleed: [], guide: [] };

const dims = (tree: FoldTree, progress = 1) => {
  const world = foldTree(tree, { progress });
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of tree.panels) {
    for (const v of p.polygon) {
      const q = transformPoint(world.get(p.id)!, flatPoint(v));
      [q.x, q.y, q.z].forEach((n, i) => {
        lo[i] = Math.min(lo[i]!, n);
        hi[i] = Math.max(hi[i]!, n);
      });
    }
  }
  const size = hi.map((h, i) => +(h - lo[i]!).toFixed(3));
  return { size, sorted: [...size].sort((a, b) => a - b), lo, hi };
};

const withMode = (s: FoldSetup, mode: "closed" | "open" | "beside", openDeg?: number): FoldSetup => ({
  ...s,
  parts: s.parts!.map((p) => ({ ...p, placement: { mode, ...(openDeg === undefined ? {} : { openDeg }) } })),
});

describe("box with a lid drawn next to it", () => {
  const detected = detectFoldSetup(BOX_AND_LID);
  const setup = detected.setup;

  it("finds the lid as an extra part with its own base panel", () => {
    expect(setup.panels).toHaveLength(10);
    expect(setup.parts).toHaveLength(1);
    expect(setup.hinges).toHaveLength(8);
    expect(setup.parts![0]!.rootId).not.toBe(setup.rootId);
    expect(detected.warnings.join(" ")).toMatch(/2 separate pieces/);
    expect(validateFoldSetup(setup)).toEqual([]);
    // The deeper piece (the 40 x 40 tray, 30 high) is the main body, even though the lid's centre panel is bigger.
    const rootPanel = setup.panels.find((p) => p.id === setup.rootId)!;
    const w = Math.max(...rootPanel.polygon.filter((_, i) => i % 2 === 0)) - Math.min(...rootPanel.polygon.filter((_, i) => i % 2 === 0));
    expect(w).toBeCloseTo(40, 5);
    const lidRoot = setup.panels.find((p) => p.id === setup.parts![0]!.rootId)!;
    expect(Math.max(...lidRoot.polygon.filter((_, i) => i % 2 === 0)) - Math.min(...lidRoot.polygon.filter((_, i) => i % 2 === 0))).toBeCloseTo(44, 5);
  });

  it("sizes the whole sheet from all pieces, not only the biggest", () => {
    const size = importedCutSize(BOX_AND_LID);
    expect(size.width).toBeCloseTo(150 + 74 - 0, 5); // from x 0 to x 224
    expect(size.height).toBeCloseTo(100, 5);
    expect(importedDefaults(BOX_AND_LID).width).toBeCloseTo(224, 0);
  });

  it("keeps both pieces inside the cut and bleed boxes and scales them together", () => {
    const gen = createImportedGenerator("t", BOX_AND_LID, setup);
    const g1 = gen.generate({ width: 224, bleed: 3 });
    expect(g1.cutBounds.min.x).toBeCloseTo(0, 5);
    expect(g1.cutBounds.max.x).toBeCloseTo(224, 5);
    expect(g1.bleedBounds.max.x).toBeCloseTo(227, 5);
    expect(g1.bleedBounds.min.y).toBeCloseTo(-3, 5);
    const g2 = gen.generate({ width: 448, bleed: 3 });
    expect(g2.cutBounds.max.x).toBeCloseTo(448, 5);
    expect(g2.cutBounds.max.y).toBeCloseTo(200, 5);
    const xs = g2.foldTree.panels.flatMap((p) => p.polygon.map((v) => v.x));
    expect(Math.max(...xs)).toBeCloseTo(448, 5);
    expect(g2.foldTree.parts).toHaveLength(1);
  });

  it("flat-only: both pieces are inside the sheet, with one sheet panel over both", () => {
    const g = createImportedGenerator("t", BOX_AND_LID).generate({ width: 224, bleed: 3 });
    expect(g.cutBounds.max.x).toBeCloseTo(224, 5);
    expect(g.bleedBounds.max.x).toBeCloseTo(227, 5);
    expect(g.cutLoops).toHaveLength(2);
    const sheet = g.foldTree.panels[0]!;
    expect(Math.max(...sheet.polygon.map((v) => v.x))).toBeCloseTo(224, 5);
    expect(g.foldTree.parts).toBeUndefined();
  });

  it("scales extra paths the same way", () => {
    const p = scaleImportedPaths(BOX_AND_LID, 448, [line(224, 100, 224, 100)])[0]!;
    expect(p.pts[0]).toBeCloseTo(448, 5);
    expect(p.pts[1]).toBeCloseTo(200, 5);
  });

  const treeOf = (s: FoldSetup) => createImportedGenerator("t", BOX_AND_LID, s).generate({ width: 224, bleed: 3 }).foldTree;

  it("puts a closed lid on top of the body", () => {
    const { size, lo, hi } = dims(treeOf(withMode(setup, "closed")));
    // 44 x 44 footprint; height = body 30 (or 15) + the other part
    expect(size[0]).toBeCloseTo(44, 2);
    expect(size[1]).toBeCloseTo(44, 2);
    expect(size[2]).toBeCloseTo(45, 2);
    expect(lo[2]).toBeCloseTo(0, 2);
    expect(hi[2]).toBeCloseTo(45, 2);
  });

  it("stands a part beside the body on the same ground", () => {
    const { size, lo } = dims(treeOf(withMode(setup, "beside")));
    expect(size[2]).toBeCloseTo(30, 2);
    expect(size[1]).toBeCloseTo(44, 2);
    expect(size[0]).toBeGreaterThan(80);
    expect(lo[2]).toBeCloseTo(0, 2);
  });

  it("lifts an open lid higher than a closed one, and 0 degrees equals closed", () => {
    const closedH = dims(treeOf(withMode(setup, "closed"))).hi[2]!;
    expect(dims(treeOf(withMode(setup, "open", 40))).hi[2]!).toBeGreaterThan(closedH + 5);
    expect(dims(treeOf(withMode(setup, "open", 0))).hi[2]!).toBeCloseTo(closedH, 3);
  });

  it("is flat at progress 0, and does not throw part-way", () => {
    const tree = treeOf(setup);
    const flat = dims(tree, 0);
    expect(flat.size[2]).toBeCloseTo(0, 6);
    for (const p of [0.1, 0.5, 0.79, 0.8, 0.9, 0.99, 1]) expect(() => foldTree(tree, { progress: p })).not.toThrow();
  });

  it("folds the box before moving the lid", () => {
    const tree = treeOf(withMode(setup, "closed"));
    const at = (p: number) => dims(tree, p);
    // At 80% the pieces are folded but the lid has not moved yet: it is still beside the body (wide), not over it.
    expect(at(0.8).size[0]).toBeGreaterThan(150);
    expect(at(1).size[0]).toBeLessThan(60);
  });

  it("without parts nothing changes: a single piece folds as before", () => {
    const one: FlatDieline = { cut: [base.cut], crease: base.crease, bleed: [], guide: [] };
    const s = detectFoldSetup(one).setup;
    expect(s.parts).toBeUndefined();
    const tree = createImportedGenerator("t", one, s).generate({}).foldTree;
    expect(tree.parts).toBeUndefined();
    expect(dims(tree).sorted).toEqual([30, 40, 40]);
  });
});

describe("validating extra parts", () => {
  const setup = detectFoldSetup(BOX_AND_LID).setup;
  const partRoot = setup.parts![0]!.rootId;
  it("accepts the detected setup", () => expect(validateFoldSetup(setup)).toEqual([]));
  it("rejects a part whose base is the main base", () => {
    expect(validateFoldSetup({ ...setup, parts: [{ rootId: setup.rootId, placement: { mode: "closed" } }] }).join(" ")).toMatch(/cannot also be the base/);
  });
  it("rejects a part base that does not exist or is a folded child", () => {
    expect(validateFoldSetup({ ...setup, parts: [{ rootId: "nope", placement: { mode: "closed" } }] }).join(" ")).toMatch(/does not exist/);
    const child = setup.hinges.find((h) => h.parentId === partRoot)!.childId;
    expect(validateFoldSetup({ ...setup, parts: [{ rootId: child, placement: { mode: "closed" } }] }).join(" ")).toMatch(/cannot also fold off another panel/);
  });
  it("rejects a bad placement or angle", () => {
    expect(validateFoldSetup({ ...setup, parts: [{ rootId: partRoot, placement: { mode: "sideways" as never } }] }).join(" ")).toMatch(/needs a placement/);
    expect(validateFoldSetup({ ...setup, parts: [{ rootId: partRoot, placement: { mode: "open", openDeg: 200 } }] }).join(" ")).toMatch(/between 0 and 120/);
  });
  it("without parts, the lid panels are not reached by any root", () => {
    const { parts: _parts, ...noParts } = setup;
    expect(validateFoldSetup(noParts).join(" ")).toMatch(/do not form one connected tree/);
  });
});

describe("placing a part: inside, sides, distance, position, fit", () => {
  // A 40 x 40 x 30 tray and a 30 x 30 x 10 insert drawn beside it.
  const insert = cross(150, 0, 30, 10);
  const TRAY_AND_INSERT: FlatDieline = { cut: [base.cut, insert.cut], crease: [...base.crease, ...insert.crease], bleed: [], guide: [] };
  const setup = detectFoldSetup(TRAY_AND_INSERT).setup;
  const set = (placement: object, extra: object = {}): FoldSetup => ({ ...setup, parts: setup.parts!.map((p) => ({ ...p, placement: placement as never, ...extra })) });
  const treeOf = (s: FoldSetup) => createImportedGenerator("t", TRAY_AND_INSERT, s).generate({ width: 200, bleed: 3 }).foldTree;

  it("finds the tray as main body and the insert as a part", () => {
    expect(setup.parts).toHaveLength(1);
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("inside: stands in the middle of the body, on its floor, not taller than the body", () => {
    const { lo, hi, size } = dims(treeOf(set({ mode: "inside" })));
    expect(size[0]).toBeCloseTo(40, 2);
    expect(size[1]).toBeCloseTo(40, 2);
    expect(size[2]).toBeCloseTo(30, 2);
    expect(lo[2]).toBeCloseTo(0, 2);
    expect(hi[2]).toBeCloseTo(30, 2);
  });

  it("inside with a distance lifts it off the floor by that much", () => {
    const flush = dims(treeOf(set({ mode: "inside" }))).hi[2]!;
    const raised = dims(treeOf(set({ mode: "inside", gap: 25 }))).hi[2]!;
    expect(raised).toBeGreaterThan(flush);
  });

  it("auto: goes inside when it fits, on top when it does not", () => {
    expect(dims(treeOf(set({ mode: "auto" }))).size[2]).toBeCloseTo(30, 2); // insert fits: nothing sticks out
    const lidded = detectFoldSetup(BOX_AND_LID).setup;
    const tree = createImportedGenerator("t", BOX_AND_LID, { ...lidded, parts: lidded.parts!.map((p) => ({ ...p, placement: { mode: "auto" as const } })) }).generate({ width: 224, bleed: 3 }).foldTree;
    expect(dims(tree).size[2]).toBeCloseTo(45, 2); // the 44 wide lid cannot go into a 40 wide tray
  });

  it("closed with a distance sits that much higher on the rim", () => {
    const a = dims(treeOf(set({ mode: "closed" }))).hi[2]!;
    const b = dims(treeOf(set({ mode: "closed", gap: 20 }))).hi[2]!;
    expect(b - a).toBeCloseTo(20, 2);
  });

  it("beside: the side and the gap decide where it stands", () => {
    const right = dims(treeOf(set({ mode: "beside", side: "right", gap: 10 })));
    expect(right.size[0]).toBeCloseTo(40 + 10 + 30, 2);
    const back = dims(treeOf(set({ mode: "beside", side: "back", gap: 10 })));
    expect(back.size[1]).toBeCloseTo(40 + 10 + 30, 2);
    expect(back.size[0]).toBeCloseTo(40, 2);
    const left = dims(treeOf(set({ mode: "beside", side: "left", gap: 5 })));
    expect(left.lo[0]).toBeCloseTo(30 - 5 - 30, 2); // the body starts at x 30 (its walls stand up), the part is 30 wide
  });

  it("a position shift moves the part by exactly that much", () => {
    const a = dims(treeOf(set({ mode: "beside", side: "right", gap: 10 })));
    const b = dims(treeOf(set({ mode: "beside", side: "right", gap: 10, offset: { x: 25, z: 40 } })));
    expect(b.hi[0]! - a.hi[0]!).toBeCloseTo(25, 2);
    expect(b.hi[2]! - a.hi[2]!).toBeGreaterThan(0);
  });

  it("partFits reports whether the part fits in the body, and the room left", () => {
    const [fit] = partFits(treeOf(set({ mode: "inside" })));
    expect(fit!.fits).toBe(true);
    expect(fit!.auto).toBe("inside");
    expect(fit!.slack.x).toBeCloseTo(10, 2);
    expect(fit!.slack.z).toBeCloseTo(20, 2);
    const lidded = detectFoldSetup(BOX_AND_LID).setup;
    const tree = createImportedGenerator("t", BOX_AND_LID, lidded).generate({ width: 224, bleed: 3 }).foldTree;
    const [lidFit] = partFits(tree);
    expect(lidFit!.fits).toBe(false);
    expect(lidFit!.auto).toBe("closed");
    expect(lidFit!.slack.x).toBeCloseTo(-4, 2);
  });

  it("validates distance, shift, side, timing and the piece it is placed against", () => {
    const root = setup.parts![0]!.rootId;
    const bad = (placement: object, extra: object = {}) => validateFoldSetup(set(placement, extra)).join(" ");
    expect(bad({ mode: "beside", side: "up" })).toMatch(/right, left, front or back/);
    expect(bad({ mode: "closed", gap: 1e9 })).toMatch(/distance/);
    expect(bad({ mode: "closed", offset: { x: NaN } })).toMatch(/position shift/);
    expect(bad({ mode: "closed", relativeTo: root })).toMatch(/against itself/);
    expect(bad({ mode: "closed", relativeTo: "nope" })).toMatch(/does not exist/);
    expect(bad({ mode: "closed" }, { timing: "later" })).toMatch(/timing/);
    expect(bad({ mode: "inside", relativeTo: setup.rootId }, { timing: "after", name: "Insert" })).toBe("");
  });
});

describe("pieces have their own fold steps and timing", () => {
  const detected = detectFoldSetup(BOX_AND_LID).setup;
  const root = detected.parts![0]!.rootId;
  // Main body: every fold at step 1. Lid: its folds at steps 1 and 2.
  const lidHinges = (() => {
    const mine = new Set([root]);
    for (let n = 0; n < 5; n++) for (const h of detected.hinges) if (mine.has(h.parentId)) mine.add(h.childId);
    return detected.hinges.filter((h) => mine.has(h.childId) && h.childId !== root);
  })();
  const staged: FoldSetup = {
    ...detected,
    hinges: detected.hinges.map((h) => ({ ...h, order: lidHinges.some((l) => l.id === h.id) ? (h.id === lidHinges[0]!.id ? 2 : 1) : 1 })),
  };
  const treeOf = (s: FoldSetup) => createImportedGenerator("t", BOX_AND_LID, s).generate({ width: 224, bleed: 3 }).foldTree;

  it("a part's step 1 runs together with the main body's step 1", () => {
    const tree = treeOf(staged);
    const p = stagedHingeProgress(tree, 0.5)!;
    const mainHinge = tree.hinges.find((h) => !lidHinges.some((l) => l.id === h.id))!;
    const lidFirst = tree.hinges.find((h) => lidHinges.some((l) => l.id === h.id) && h.foldOrder === 1)!;
    const lidSecond = tree.hinges.find((h) => h.id === lidHinges[0]!.id)!;
    expect(p[mainHinge.id]).toBeCloseTo(0.5, 6); // the main body has one step: it takes the whole time
    expect(p[lidFirst.id]).toBe(1); // the lid's step 1 runs at the same time and is done at half time
    expect(p[lidSecond.id]).toBe(0); // its step 2 has not started
    expect(stagedHingeProgress(tree, 1)![lidSecond.id]).toBe(1);
  });

  it("timing 'after' folds the part when the main body is done", () => {
    const after: FoldSetup = { ...staged, parts: staged.parts!.map((q) => ({ ...q, timing: "after" as const })) };
    const tree = treeOf(after);
    expect([...foldWindows(tree)]).toEqual([[tree.rootId, { from: 0, to: 0.5 }], [root, { from: 0.5, to: 1 }]]);
    const early = stagedHingeProgress(tree, 0.4)!;
    for (const h of lidHinges) expect(early[h.id]).toBe(0);
    const mainHinge = tree.hinges.find((h) => !lidHinges.some((l) => l.id === h.id))!;
    expect(early[mainHinge.id]).toBeGreaterThan(0);
    expect(stagedHingeProgress(tree, 0.5)![mainHinge.id]).toBe(1);
    expect(stagedHingeProgress(tree, 1)![lidHinges[0]!.id]).toBe(1);
    expect(() => foldTree(tree, { progress: 0.6 })).not.toThrow();
  });
});

describe("a part hops over the other piece on its way", () => {
  const detected = detectFoldSetup(BOX_AND_LID).setup;
  const withHop = (hop?: number): FoldSetup => ({ ...detected, parts: detected.parts!.map((p) => ({ ...p, placement: { mode: "closed" as const, ...(hop === undefined ? {} : { hop }) } })) });
  const treeOf = (s: FoldSetup) => createImportedGenerator("t", BOX_AND_LID, s).generate({ width: 224, bleed: 3 }).foldTree;
  /** Highest point of the whole model, and of the lid panels alone (the part's own base panel's piece). */
  const lowestPartZ = (tree: FoldTree, p: number) => {
    const world = foldTree(tree, { progress: p });
    const lidIds = new Set(tree.panels.filter((q) => q.id === tree.parts![0]!.rootId || tree.hinges.some((h) => h.childId === q.id && (h.parentId === tree.parts![0]!.rootId))).map((q) => q.id));
    let lo = Infinity;
    for (const q of tree.panels) {
      if (!lidIds.has(q.id)) continue;
      for (const v of q.polygon) lo = Math.min(lo, transformPoint(world.get(q.id)!, flatPoint(v)).z);
    }
    return lo;
  };

  it("arrives exactly where it did before, and starts where it did", () => {
    const a = dims(treeOf(withHop(0)), 1);
    const b = dims(treeOf(withHop()), 1);
    expect(b.size).toEqual(a.size);
    expect(b.hi[2]).toBeCloseTo(a.hi[2]!, 6);
    const flat = dims(treeOf(withHop()), 0.8); // folded, not yet moving
    expect(flat.size).toEqual(dims(treeOf(withHop(0)), 0.8).size);
  });

  it("is lifted in the middle of the move, more than a straight slide", () => {
    const tree = treeOf(withHop());
    const straight = treeOf(withHop(0));
    const mid = 0.9; // halfway through the placing part of the animation
    expect(dims(tree, mid).hi[2]!).toBeGreaterThan(dims(straight, mid).hi[2]! + 20);
    expect(lowestPartZ(tree, mid)).toBeGreaterThan(lowestPartZ(straight, mid) + 20);
  });

  it("a bigger lift lifts higher; the move never throws", () => {
    const low = dims(treeOf(withHop(10)), 0.9).hi[2]!;
    const high = dims(treeOf(withHop(80)), 0.9).hi[2]!;
    expect(high).toBeGreaterThan(low + 40);
    for (const p of [0.8, 0.85, 0.9, 0.95, 0.999, 1]) expect(() => foldTree(treeOf(withHop(30)), { progress: p })).not.toThrow();
  });

  it("validates the lift", () => {
    const bad = (hop: number) => validateFoldSetup({ ...withHop(), parts: detected.parts!.map((p) => ({ ...p, placement: { mode: "closed" as const, hop } })) }).join(" ");
    expect(bad(-1)).toMatch(/lift while moving/);
    expect(bad(1e9)).toMatch(/lift while moving/);
    expect(bad(25)).toBe("");
  });
});

describe("a part's starting position", () => {
  const detected = detectFoldSetup(BOX_AND_LID).setup;
  const withStart = (start?: { from?: "left" | "right" | "back" | "front"; x?: number; y?: number; z?: number }): FoldSetup => ({ ...detected, parts: detected.parts!.map((p) => ({ ...p, placement: { mode: "closed" as const, ...(start ? { start } : {}) } })) });
  const treeOf = (s: FoldSetup) => createImportedGenerator("t", BOX_AND_LID, s).generate({ width: 224, bleed: 3 }).foldTree;
  /** Bounds of the extra part's own panels only. */
  const partBox = (tree: FoldTree, progress: number) => {
    const ids = new Set([tree.parts![0]!.rootId]);
    for (let n = 0; n < 6; n++) for (const h of tree.hinges) if (ids.has(h.parentId)) ids.add(h.childId);
    const world = foldTree(tree, { progress });
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const q of tree.panels) {
      if (!ids.has(q.id)) continue;
      for (const v of q.polygon) {
        const r = transformPoint(world.get(q.id)!, flatPoint(v));
        [r.x, r.y, r.z].forEach((n, i) => {
          lo[i] = Math.min(lo[i]!, n);
          hi[i] = Math.max(hi[i]!, n);
        });
      }
    }
    return { lo, hi };
  };

  it("shifts the part while it is still flat and while it folds, and is gone on arrival", () => {
    const base = treeOf(withStart());
    const moved = treeOf(withStart({ x: 30, y: -20, z: 50 }));
    for (const p of [0, 0.4, 0.8]) {
      const a = partBox(base, p);
      const b = partBox(moved, p);
      expect(b.lo[0]! - a.lo[0]!).toBeCloseTo(30, 3);
      expect(b.lo[1]! - a.lo[1]!).toBeCloseTo(-20, 3);
      expect(b.lo[2]! - a.lo[2]!).toBeCloseTo(50, 3);
    }
    // the main body never moves
    expect(dims(moved, 0).lo[2]).toBeCloseTo(dims(base, 0).lo[2]!, 6);
    // at the end the part is exactly where it would be without a start shift
    const a = partBox(base, 1);
    const b = partBox(moved, 1);
    for (let i = 0; i < 3; i++) {
      expect(b.lo[i]).toBeCloseTo(a.lo[i]!, 6);
      expect(b.hi[i]).toBeCloseTo(a.hi[i]!, 6);
    }
  });

  it("eases back to the final place while it moves in", () => {
    const base = treeOf(withStart());
    const moved = treeOf(withStart({ z: 80 }));
    const d = (p: number) => partBox(moved, p).lo[2]! - partBox(base, p).lo[2]!;
    expect(d(0.8)).toBeCloseTo(80, 3);
    expect(d(0.9)).toBeCloseTo(40, 3); // halfway through the move
    expect(d(1)).toBeCloseTo(0, 6);
  });

  it("starts clear of the main body on the chosen side, then arrives in the same place", () => {
    const base = treeOf(withStart());
    const mainFlat = (tree: FoldTree) => {
      const mainIds = new Set([tree.rootId]);
      for (let n = 0; n < 6; n++) for (const h of tree.hinges) if (mainIds.has(h.parentId)) mainIds.add(h.childId);
      const world = foldTree(tree, { progress: 0 });
      const xs: number[] = [], ys: number[] = [];
      for (const q of tree.panels) if (mainIds.has(q.id)) for (const v of q.polygon) { const r = transformPoint(world.get(q.id)!, flatPoint(v)); xs.push(r.x); ys.push(r.y); }
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    const m = mainFlat(base);
    const left = partBox(treeOf(withStart({ from: "left" })), 0);
    expect(left.hi[0]!).toBeLessThan(m.minX);
    const right = partBox(treeOf(withStart({ from: "right" })), 0);
    expect(right.lo[0]!).toBeGreaterThan(m.maxX);
    const back = partBox(treeOf(withStart({ from: "back" })), 0);
    expect(back.lo[1]!).toBeGreaterThan(m.maxY);
    const front = partBox(treeOf(withStart({ from: "front" })), 0);
    expect(front.hi[1]!).toBeLessThan(m.minY);
    // they all lie on the ground (z 0) at the start, and the shift adds to it
    expect(left.lo[2]).toBeCloseTo(0, 6);
    expect(partBox(treeOf(withStart({ from: "left", z: 40 })), 0).lo[2]).toBeCloseTo(40, 6);
    // at the end: exactly the normal final place
    for (const from of ["left", "right", "back", "front"] as const) {
      const a = partBox(base, 1);
      const b = partBox(treeOf(withStart({ from, z: 30 })), 1);
      for (let i = 0; i < 3; i++) {
        expect(b.lo[i]).toBeCloseTo(a.lo[i]!, 6);
        expect(b.hi[i]).toBeCloseTo(a.hi[i]!, 6);
      }
    }
  });

  it("validates the start shift", () => {
    expect(validateFoldSetup(withStart({ z: 1e9 })).join(" ")).toMatch(/starting position/);
    expect(validateFoldSetup(withStart({ x: NaN })).join(" ")).toMatch(/starting position/);
    expect(validateFoldSetup(withStart({ from: "up" as never })).join(" ")).toMatch(/start on the right, left, front or back/);
    expect(validateFoldSetup(withStart({ x: 10, y: -10, z: 10 }))).toEqual([]);
    expect(validateFoldSetup(withStart({ from: "left", z: 10 }))).toEqual([]);
  });
});

describe("the board of a template without box settings", () => {
  const detected = detectFoldSetup(BOX_AND_LID).setup; // two pieces: no box settings
  const keys = (g: ReturnType<typeof createImportedGenerator>) => g.params.map((p) => p.key);

  it("is still offered, in the Material group, starting at the suggested 0.5 mm", () => {
    const g = createImportedGenerator("t", BOX_AND_LID, detected);
    expect(keys(g)).toEqual(["width", "thickness", "bleed"]);
    expect(g.params.find((p) => p.key === "thickness")).toMatchObject({ group: "Material", unit: "mm", kind: "number" });
    expect(g.generate({}).params).toMatchObject({ thickness: 0.5 });
  });

  it("starts at the board the admin chose, and a customer can change it", () => {
    const g = createImportedGenerator("t", BOX_AND_LID, { ...detected, construction: { thickness: 0.42 } });
    expect(g.generate({}).params).toMatchObject({ thickness: 0.42 });
    expect(g.generate({ thickness: 1.2 }).params).toMatchObject({ thickness: 1.2 });
  });

  it("does not change the drawing, and rejects a board outside the range", () => {
    const g = createImportedGenerator("t", BOX_AND_LID, detected);
    const a = g.generate({ width: 224 });
    const b = g.generate({ width: 224, thickness: 2 });
    expect(b.cutBounds).toEqual(a.cutBounds);
    expect(b.foldTree.panels.map((p) => p.polygon)).toEqual(a.foldTree.panels.map((p) => p.polygon));
    expect(() => g.generate({ thickness: 99 })).toThrow();
  });
});
