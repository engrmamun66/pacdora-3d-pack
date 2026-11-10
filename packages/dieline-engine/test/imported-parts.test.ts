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
