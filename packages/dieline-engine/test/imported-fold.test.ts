import { describe, expect, it } from "vitest";
import {
  type DielineGeometry,
  type FlatDieline,
  type FlatPath,
  type FoldSetup,
  type FoldTree,
  ImportedDielineError,
  createImportedGenerator,
  outlineArea,
  panelOutline,
  detectFoldSetup,
  flatPoint,
  flattenOutline,
  foldTree,
  generateDieline,
  stagedHingeProgress,
  transformPoint,
  validateFoldSetup,
} from "../src";

const toFlat = (geo: DielineGeometry): FlatDieline => ({
  cut: [
    ...geo.cutLoops.map((o): FlatPath => ({ pts: flattenOutline(o).flatMap((p) => [p.x, p.y]), closed: true })),
    ...geo.slitLines.map((s): FlatPath => ({ pts: [s.a.x, s.a.y, s.b.x, s.b.y], closed: false })),
  ],
  crease: geo.creaseLines.map((c): FlatPath => ({ pts: [c.a.x, c.a.y, c.b.x, c.b.y], closed: false })),
  bleed: [],
  guide: [],
});

const foldedDims = (tree: FoldTree, progress = 1): number[] => {
  const world = foldTree(tree, { progress });
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of tree.panels) {
    for (const v of p.polygon) {
      const q = transformPoint(world.get(p.id)!, flatPoint(v));
      [q.x, q.y, q.z].forEach((c, i) => {
        lo[i] = Math.min(lo[i]!, c);
        hi[i] = Math.max(hi[i]!, c);
      });
    }
  }
  return hi.map((h, i) => h - lo[i]!).sort((a, b) => a - b);
};

const closed = (...xy: number[]): FlatPath => ({ pts: xy, closed: true });
const line = (...xy: number[]): FlatPath => ({ pts: xy, closed: false });
const rect = (x: number, y: number, w: number, h: number) => closed(x, y, x + w, y, x + w, y + h, x, y + h);
const flatOf = (cut: FlatPath[], crease: FlatPath[], guide: FlatPath[] = []): FlatDieline => ({ cut, crease, bleed: [], guide });

const sortNum = (a: readonly number[]) => [...a].sort((p, q) => p - q);
const polyArea = (poly: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    s += poly[i]! * poly[j + 1]! - poly[j]! * poly[i + 1]!;
  }
  return Math.abs(s) / 2;
};

/** A cube net (cross of six 50 mm squares). */
const CUBE = flatOf(
  [closed(50, 0, 100, 0, 100, 50, 150, 50, 150, 100, 100, 100, 100, 200, 50, 200, 50, 100, 0, 100, 0, 50, 50, 50)],
  [line(50, 50, 100, 50), line(50, 100, 100, 100), line(50, 150, 100, 150), line(50, 50, 50, 100), line(100, 50, 100, 100)],
);

/** Two 50 x 50 panels side by side, folded along x = 50. */
const TWO = flatOf([rect(0, 0, 100, 50)], [line(50, 0, 50, 50)]);

const generatorOf = (flat: FlatDieline, setup: FoldSetup) => createImportedGenerator("t", flat, setup);

describe("fold detection against the engine's own cartons", () => {
  const cases = [
    ["tuck-end-carton", { width: 100, depth: 50, height: 150 }],
    ["crash-lock-carton", { width: 80, depth: 60, height: 120 }],
    ["slotted-box", { width: 300, depth: 200, height: 200 }],
  ] as const;

  for (const [id, params] of cases) {
    describe(id, () => {
      const geo = generateDieline(id, params);
      const flat = toFlat(geo);
      const { setup, warnings } = detectFoldSetup(flat);

      it("finds the same panels and hinges as the original fold tree", () => {
        expect(setup.panels).toHaveLength(geo.foldTree.panels.length);
        expect(setup.hinges).toHaveLength(geo.foldTree.hinges.length);
        expect(warnings).toEqual([]);
        expect(validateFoldSetup(setup)).toEqual([]);
      });

      it("panel areas and hinge lengths match the original", () => {
        // The original panels have true arcs; the imported ones have the flattened arcs (chords within 5 micrometres).
        const want = sortNum(geo.foldTree.panels.map((p) => outlineArea(panelOutline(p))));
        const got = sortNum(setup.panels.map((p) => polyArea(p.polygon)));
        got.forEach((a, i) => expect(Math.abs(a - want[i]!) / want[i]!).toBeLessThan(1e-4));
        const wantLen = sortNum(geo.foldTree.hinges.map((h) => Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y)));
        const gotLen = sortNum(setup.hinges.map((h) => Math.hypot(h.line[2] - h.line[0], h.line[3] - h.line[1])));
        gotLen.forEach((l, i) => expect(l).toBeCloseTo(wantLen[i]!, 6));
      });

      it("every original hinge line is found (as an unordered segment)", () => {
        const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
        for (const h of geo.foldTree.hinges) {
          const hit = setup.hinges.find(
            (d) =>
              (same(d.line[0], h.a.x) && same(d.line[1], h.a.y) && same(d.line[2], h.b.x) && same(d.line[3], h.b.y)) ||
              (same(d.line[0], h.b.x) && same(d.line[1], h.b.y) && same(d.line[2], h.a.x) && same(d.line[3], h.a.y)),
          );
          expect(hit, `hinge ${h.id}`).toBeDefined();
        }
      });

      it("folds to the same box size as the original (within 1%)", () => {
        const folded = generatorOf(flat, setup).generate({}).foldTree;
        const want = foldedDims(geo.foldTree);
        const got = foldedDims(folded);
        got.forEach((d, i) => expect(Math.abs(d - want[i]!) / want[i]!).toBeLessThan(0.01));
      });

      it("with the original fold angles, folds exactly like the original", () => {
        const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
        const angles = setup.hinges.map((d) => {
          const h = geo.foldTree.hinges.find(
            (o) =>
              (same(d.line[0], o.a.x) && same(d.line[1], o.a.y) && same(d.line[2], o.b.x) && same(d.line[3], o.b.y)) ||
              (same(d.line[0], o.b.x) && same(d.line[1], o.b.y) && same(d.line[2], o.a.x) && same(d.line[3], o.a.y)),
          )!;
          return { ...d, angleDeg: h.foldAngleDeg };
        });
        const folded = generatorOf(flat, { ...setup, hinges: angles }).generate({}).foldTree;
        const want = foldedDims(geo.foldTree);
        foldedDims(folded).forEach((d, i) => expect(d).toBeCloseTo(want[i]!, 6));
      });

      it("is deterministic", () => {
        expect(JSON.stringify(detectFoldSetup(flat))).toBe(JSON.stringify({ setup, warnings }));
      });
    });
  }

  it("names panels in reading order, picks the largest panel as root and sets default roles", () => {
    const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
    const { setup } = detectFoldSetup(toFlat(geo));
    expect(setup.panels.map((p) => p.id)).toEqual(setup.panels.map((_, i) => `p${i + 1}`));
    expect(setup.panels.map((p) => p.label)).toEqual(setup.panels.map((_, i) => `Panel ${i + 1}`));
    const areas = new Map(setup.panels.map((p) => [p.id, polyArea(p.polygon)]));
    const root = setup.panels.find((p) => p.id === setup.rootId)!;
    expect(root.role).toBe("body");
    for (const p of setup.panels) expect(areas.get(p.id)!).toBeLessThanOrEqual(areas.get(root.id)! + 1e-9);
    const depth = new Map<string, number>([[setup.rootId, 0]]);
    for (const h of setup.hinges) depth.set(h.childId, depth.get(h.parentId)! + 1);
    for (const h of setup.hinges) {
      expect(h.angleDeg).toBe(90);
      expect(h.order).toBe(depth.get(h.childId));
      expect(h.id).toMatch(/^h\d+$/);
    }
    for (const p of setup.panels) {
      if (depth.get(p.id)! <= 1) expect(p.role).toBe("body");
      else expect(["closure", "tuck"]).toContain(p.role);
      expect(p.printable).toBe(p.role !== "tuck");
    }
    expect(setup.panels.some((p) => p.role === "tuck")).toBe(true);
  });

  it("is fast on a dieline with thousands of tiny segments", () => {
    const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150, dustFlapCornerRadius: 8, tuckCornerCut: 8 });
    const flat: FlatDieline = {
      ...toFlat(geo),
      cut: [
        ...geo.cutLoops.map((o): FlatPath => ({ pts: flattenOutline(o, 1e-7).flatMap((p) => [p.x, p.y]), closed: true })),
        ...geo.slitLines.map((s): FlatPath => ({ pts: [s.a.x, s.a.y, s.b.x, s.b.y], closed: false })),
      ],
    };
    const segments = flat.cut.reduce((n, p) => n + p.pts.length / 2, 0);
    expect(segments).toBeGreaterThan(4000);
    const t0 = performance.now();
    const { setup } = detectFoldSetup(flat);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);
    expect(setup.panels).toHaveLength(13);
    expect(setup.hinges).toHaveLength(12);
    expect(validateFoldSetup(setup)).toEqual([]);
  });
});

describe("fold detection on hand-written dielines", () => {
  it("cross-shaped box: six panels, five hinges, folds to a cube", () => {
    const { setup, warnings } = detectFoldSetup(CUBE);
    expect(warnings).toEqual([]);
    expect(setup.panels).toHaveLength(6);
    expect(setup.hinges).toHaveLength(5);
    expect(validateFoldSetup(setup)).toEqual([]);
    const tree = generatorOf(CUBE, setup).generate({}).foldTree;
    foldedDims(tree).forEach((d) => expect(d).toBeCloseTo(50, 6));
  });

  it("a hole is void, not a panel, and is reported", () => {
    const flat = flatOf([rect(0, 0, 100, 60), rect(10, 10, 10, 10)], [line(50, 0, 50, 60)]);
    const { setup, warnings } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2);
    expect(setup.hinges).toHaveLength(1);
    expect(setup.panels.some((p) => Math.abs(polyArea(p.polygon) - 100) < 1e-6)).toBe(false);
    expect(warnings.join(" ")).toMatch(/cut-out/);
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("an open slit and a cut touching the outline do not create panels", () => {
    const flat = flatOf([rect(0, 0, 100, 60), line(75, 0, 75, 20)], [line(50, 0, 50, 60)]);
    const { setup, warnings } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2);
    expect(setup.hinges).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("snaps endpoints that are within 0.02 mm and splits T junctions", () => {
    const flat = flatOf([rect(0, 0, 100, 60)], [line(50.01, -0.005, 49.99, 60.015)]);
    const { setup } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2);
    expect(setup.hinges).toHaveLength(1);
  });

  it("splits lines that cross", () => {
    const flat = flatOf([rect(0, 0, 100, 100)], [line(0, 50, 100, 50), line(50, 0, 50, 100)]);
    const { setup, warnings } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(4);
    // 4 adjacent pairs; a tree uses 3, the fourth would close a loop.
    expect(setup.hinges).toHaveLength(3);
    expect(warnings.join(" ")).toMatch(/loop/);
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("a fold line that ends inside a panel is ignored with a warning", () => {
    const flat = flatOf([rect(0, 0, 100, 60)], [line(50, 0, 50, 60), line(20, 30, 40, 30)]);
    const { setup, warnings } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2);
    expect(setup.hinges).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/ignored/);
  });

  it("panels cut free from the rest are left out with a warning", () => {
    const flat = flatOf([rect(0, 0, 100, 60), line(0, 15, 100, 15)], [line(50, 15, 50, 60)]);
    const { setup, warnings } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2); // the two lower halves; the strip above the cut is not connected
    expect(setup.hinges).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/not connected/);
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("a fold between two panels that is cut along part of its length still makes one hinge", () => {
    // Fold at x = 50 with a slit in the middle (cut over the same line): panels stay joined at the two ends.
    const flat = flatOf([rect(0, 0, 100, 60), line(50, 20, 50, 40)], [line(50, 0, 50, 20), line(50, 40, 50, 60)]);
    const { setup } = detectFoldSetup(flat);
    expect(setup.panels).toHaveLength(2);
    expect(setup.hinges).toHaveLength(1);
    expect(setup.hinges[0]!.line.map((v) => Math.round(v))).toEqual(expect.arrayContaining([50]));
    expect(Math.hypot(setup.hinges[0]!.line[2] - setup.hinges[0]!.line[0], setup.hinges[0]!.line[3] - setup.hinges[0]!.line[1])).toBeCloseTo(60, 6);
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("shared edges that are cut are not hinges", () => {
    const flat = flatOf([rect(0, 0, 100, 60), line(50, 0, 50, 60)], []);
    const { setup } = detectFoldSetup(flat);
    expect(setup.hinges).toHaveLength(0);
    expect(setup.panels).toHaveLength(1); // the other half is unreachable
  });

  it("returns warnings, not exceptions, for empty or odd input", () => {
    expect(detectFoldSetup(flatOf([], [])).setup.panels).toHaveLength(0);
    expect(detectFoldSetup(flatOf([line(0, 0, 10, 0, 10, 10)], [])).warnings.length).toBeGreaterThan(0);
    expect(() => detectFoldSetup(flatOf([closed(0, 0, Number.NaN, 5, 10, 10)], [line(1, 1, 1, 1)]))).not.toThrow();
  });
});

describe("imported generator with a fold setup", () => {
  const setup = detectFoldSetup(CUBE).setup;
  const gen = generatorOf(CUBE, setup);

  it("builds the fold tree from the setup", () => {
    const g = gen.generate({});
    expect(g.foldTree.rootId).toBe(setup.rootId);
    expect(g.foldTree.panels.map((p) => p.id)).toEqual(setup.panels.map((p) => p.id));
    expect(g.foldTree.hinges).toHaveLength(5);
    g.foldTree.hinges.forEach((h, i) => {
      expect(h.foldAngleDeg).toBe(setup.hinges[i]!.angleDeg);
      expect(h.foldOrder).toBe(setup.hinges[i]!.order);
    });
    expect(g.checks.find((c) => c.name === "Folds into 3D")).toEqual({ name: "Folds into 3D", pass: true, detail: "6 panels, 5 hinges" });
    expect(g.checks.every((c) => c.pass)).toBe(true);
  });

  it("without a setup keeps the single sheet panel", () => {
    const g = createImportedGenerator("t", CUBE).generate({});
    expect(g.foldTree.panels.map((p) => p.id)).toEqual(["sheet"]);
    expect(g.foldTree.hinges).toHaveLength(0);
    expect(g.checks.find((c) => c.name === "Folds into 3D")).toBeUndefined();
    expect(g.checks.find((c) => c.name === "Imported shape")!.detail).toMatch(/No 3D fold/);
    expect(createImportedGenerator("t", CUBE, null).generate({}).foldTree.panels).toHaveLength(1);
  });

  it("attaches each guide to the panel that contains its first point", () => {
    const flat = flatOf(TWO.cut as FlatPath[], TWO.crease as FlatPath[], [rect(5, 5, 20, 20), rect(60, 10, 20, 20)]);
    const s = detectFoldSetup(flat).setup;
    const g = generatorOf(flat, s).generate({});
    const host = (x: number) => g.foldTree.panels.find((p) => p.polygon.every((v) => (x < 50 ? v.x <= 50 : v.x >= 50)))!.id;
    expect(g.safeAreas.map((a) => a.panelId)).toEqual([host(10), host(70)]);
    expect(g.safeAreas[0]!.panelId).not.toBe(g.safeAreas[1]!.panelId);
  });

  it("folded size scales with the width", () => {
    const base = foldedDims(gen.generate({}).foldTree);
    const big = foldedDims(gen.generate({ width: 225 }).foldTree); // original width is 150
    big.forEach((d, i) => expect(d).toBeCloseTo(base[i]! * 1.5, 6));

    const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
    const flat = toFlat(geo);
    const s = detectFoldSetup(flat).setup;
    const g1 = generatorOf(flat, s).generate({});
    const w = g1.cutBounds.max.x - g1.cutBounds.min.x;
    const g2 = generatorOf(flat, s).generate({ width: w * 0.5 });
    const d1 = foldedDims(g1.foldTree);
    foldedDims(g2.foldTree).forEach((d, i) => expect(d).toBeCloseTo(d1[i]! * 0.5, 6));
  });

  it("rejects an invalid setup with the first problem", () => {
    const bad: FoldSetup = { ...setup, hinges: setup.hinges.map((h, i) => (i === 0 ? { ...h, angleDeg: 0 } : h)) };
    const problems = validateFoldSetup(bad);
    expect(problems.length).toBeGreaterThan(0);
    expect(() => generatorOf(CUBE, bad)).toThrow(ImportedDielineError);
    expect(() => generatorOf(CUBE, bad)).toThrow(problems[0]!);
  });
});

describe("fold direction", () => {
  const setup = detectFoldSetup(TWO).setup;
  const zRange = (angle: number) => {
    const s: FoldSetup = { ...setup, hinges: setup.hinges.map((h) => ({ ...h, angleDeg: angle })) };
    const tree = generatorOf(TWO, s).generate({}).foldTree;
    const world = foldTree(tree);
    const zs = tree.panels.flatMap((p) => p.polygon.map((v) => transformPoint(world.get(p.id)!, flatPoint(v)).z));
    return { min: Math.min(...zs), max: Math.max(...zs) };
  };

  it("a positive angle folds toward +z and a negative one the other way", () => {
    const up = zRange(90);
    const down = zRange(-90);
    expect(up.max).toBeCloseTo(50, 6);
    expect(up.min).toBeCloseTo(0, 6);
    expect(down.min).toBeCloseTo(-50, 6);
    expect(down.max).toBeCloseTo(0, 6);
  });

  it("accepts 180 degrees", () => {
    expect(zRange(180).max).toBeCloseTo(0, 6);
    expect(validateFoldSetup({ ...setup, hinges: setup.hinges.map((h) => ({ ...h, angleDeg: 180 })) })).toEqual([]);
  });
});

describe("staged fold order", () => {
  // Cube net with the root's hinges in step 1 and everything else in step 2.
  const base = detectFoldSetup(CUBE).setup;
  const staged: FoldSetup = { ...base, hinges: base.hinges.map((h) => ({ ...h, order: h.parentId === base.rootId ? 1 : 2 })) };
  const tree = generatorOf(CUBE, staged).generate({}).foldTree;
  const plain: FoldTree = { ...tree, hinges: tree.hinges.map(({ foldOrder: _ignored, ...h }) => h) };

  it("is undefined when no hinge has an order", () => {
    expect(stagedHingeProgress(plain, 0.5)).toBeUndefined();
  });

  it("runs the steps one after another", () => {
    const early = stagedHingeProgress(tree, 0.25)!;
    const mid = stagedHingeProgress(tree, 0.5)!;
    const late = stagedHingeProgress(tree, 0.75)!;
    for (const h of tree.hinges) {
      const [first, second] = h.foldOrder === 1 ? [true, false] : [false, true];
      expect(early[h.id]).toBeCloseTo(first ? 0.5 : 0, 9);
      expect(mid[h.id]).toBeCloseTo(first ? 1 : 0, 9);
      expect(late[h.id]).toBeCloseTo(first ? 1 : 0.5, 9);
      expect(stagedHingeProgress(tree, 1)![h.id]).toBe(1);
      expect(stagedHingeProgress(tree, 0)![h.id]).toBe(0);
      expect(second).toBe(!first);
    }
  });

  it("hinges without an order follow the first step, equal orders fold together", () => {
    const t: FoldTree = {
      ...tree,
      hinges: tree.hinges.map((h, i) => ({ ...h, foldOrder: i === 0 ? undefined : i === 1 ? 3 : i === 2 ? 3 : 7 })),
    };
    const p = stagedHingeProgress(t, 0.5)!;
    // Orders 3 and 7 are two steps; the hinge without an order and both order-3 hinges are in step 0.
    expect(p[t.hinges[0]!.id]).toBe(1);
    expect(p[t.hinges[1]!.id]).toBe(1);
    expect(p[t.hinges[2]!.id]).toBe(1);
    expect(p[t.hinges[3]!.id]).toBe(0);
  });

  it("foldTree uses the stages when only progress is given", () => {
    const world = foldTree(tree, { progress: 0.5 });
    const rootKids = tree.hinges.filter((h) => h.foldOrder === 2);
    expect(rootKids.length).toBeGreaterThan(0);
    for (const h of rootKids) {
      // Second-step children have not started: they sit in their parent's plane.
      const a = world.get(h.parentId)!;
      const b = world.get(h.childId)!;
      b.forEach((v, i) => expect(v).toBeCloseTo(a[i]!, 9));
    }
    const firstKids = tree.hinges.filter((h) => h.foldOrder === 1);
    for (const h of firstKids) {
      const rootWorld = world.get(h.parentId)!;
      expect(world.get(h.childId)).not.toEqual(rootWorld);
    }
  });

  it("an explicit hingeProgress still wins", () => {
    const explicit = Object.fromEntries(tree.hinges.map((h) => [h.id, 0]));
    const world = foldTree(tree, { progress: 0.5, hingeProgress: explicit });
    world.forEach((m) => m.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9)));
  });

  it("progress 0 and 1 are identical with and without orders", () => {
    for (const p of [0, 1]) {
      const a = foldTree(tree, { progress: p });
      const b = foldTree(plain, { progress: p });
      for (const [id, m] of b) expect(a.get(id)).toEqual(m);
    }
    expect([...foldTree(tree).values()]).toEqual([...foldTree(plain).values()]);
  });

  it("the closed shape does not depend on the order", () => {
    const flipped: FoldTree = { ...tree, hinges: tree.hinges.map((h) => ({ ...h, foldOrder: 3 - (h.foldOrder ?? 1) })) };
    const a = foldTree(tree, { progress: 1 });
    const b = foldTree(flipped, { progress: 1 });
    for (const [id, m] of b) expect(a.get(id)).toEqual(m);
  });

  it("staging does not change engine cartons that have no orders", () => {
    const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
    expect(stagedHingeProgress(geo.foldTree, 0.5)).toBeUndefined();
  });
});

describe("validateFoldSetup", () => {
  const good = detectFoldSetup(TWO).setup;
  const first = (s: FoldSetup) => validateFoldSetup(s)[0] ?? "";

  it("accepts a detected setup", () => {
    expect(validateFoldSetup(good)).toEqual([]);
  });

  it("reports plain problems", () => {
    const [pa, pb] = good.panels as [FoldSetup["panels"][number], FoldSetup["panels"][number]];
    const h = good.hinges[0]!;
    expect(first({ ...good, panels: [] })).toMatch(/no panels/);
    expect(first({ ...good, rootId: "nope" })).toMatch(/root panel/);
    expect(first({ ...good, panels: [pa, { ...pb, id: pa.id }] })).toMatch(/more than once/);
    expect(first({ ...good, hinges: [{ ...h, childId: "zz" }] })).toMatch(/does not exist/);
    expect(first({ ...good, hinges: [{ ...h, angleDeg: 0 }] })).toMatch(/angle/);
    expect(first({ ...good, hinges: [{ ...h, angleDeg: 181 }] })).toMatch(/angle/);
    expect(first({ ...good, hinges: [{ ...h, angleDeg: -181 }] })).toMatch(/angle/);
    expect(first({ ...good, hinges: [{ ...h, order: 0 }] })).toMatch(/fold step/);
    expect(first({ ...good, hinges: [{ ...h, order: 1.5 }] })).toMatch(/fold step/);
    expect(first({ ...good, hinges: [{ ...h, line: [0, 0, 100, 100] }] })).toMatch(/edge of both/);
    expect(first({ ...good, hinges: [{ ...h, line: [h.line[0] + 3, h.line[1], h.line[2], h.line[3]] }] })).toMatch(/edge of both/);
    expect(first({ ...good, panels: [pa, { ...pb, polygon: [0, 0, 10, 10] }] })).toMatch(/at least 3 points/);
    expect(first({ ...good, panels: [pa, { ...pb, polygon: [0, 0, 10, 10, 20, 20] }] })).toMatch(/no area/);
  });

  it("reports panels that are not part of one tree", () => {
    expect(first({ ...good, hinges: [] })).toMatch(/connected tree/);
    const h = good.hinges[0]!;
    // Cycle: the same two panels folded both ways, root unreachable from nothing.
    const cyc = validateFoldSetup({ ...good, hinges: [h, { ...h, id: "h2", parentId: h.childId, childId: h.parentId }] });
    expect(cyc.join(" ")).toMatch(/cannot also fold|different folds|connected tree/);
    const cube = detectFoldSetup(CUBE).setup;
    const loop = cube.hinges[0]!;
    expect(validateFoldSetup({ ...cube, hinges: [...cube.hinges.slice(1), { ...loop, parentId: loop.childId, childId: loop.parentId }] }).length).toBeGreaterThan(0);
  });

  it("accepts a hinge that covers part of a longer edge", () => {
    const h = good.hinges[0]!;
    const mid: [number, number, number, number] = [h.line[0], h.line[1] + 10, h.line[2], h.line[3] - 10];
    expect(validateFoldSetup({ ...good, hinges: [{ ...h, line: mid }] })).toEqual([]);
  });
});
