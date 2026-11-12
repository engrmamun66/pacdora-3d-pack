import { describe, expect, it } from "vitest";
import {
  type DielineGeometry,
  type FlatDieline,
  type FlatPath,
  ParamValidationError,
  createImportedGenerator,
  detectFoldSetup,
  flatPoint,
  flattenOutline,
  foldTree,
  generateDieline,
  planResize,
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

/** Closed size of the carton along the base's own x, y and the box height (z). */
const closedSize = (geo: DielineGeometry): [number, number, number] => {
  const world = foldTree(geo.foldTree, { progress: 1 });
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of geo.foldTree.panels) {
    for (const v of flattenOutline({ points: p.polygon })) {
      const q = transformPoint(world.get(p.id)!, flatPoint(v));
      [q.x, q.y, q.z].forEach((c, i) => {
        lo[i] = Math.min(lo[i]!, c);
        hi[i] = Math.max(hi[i]!, c);
      });
    }
  }
  return [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
};

const original = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const flat = toFlat(original);
const { setup } = detectFoldSetup(flat);
const gen = createImportedGenerator("t", flat, setup);
const base = gen.generate({});

describe("resizing parts of an imported dieline", () => {
  it("offers the three sizes only when the sheet can be stretched", () => {
    expect(planResize(setup)).not.toBeNull();
    expect(gen.params.map((p) => p.key)).toEqual(expect.arrayContaining(["width", "baseWidth", "baseHeight", "boxHeight"]));
    const noFold = createImportedGenerator("t", flat, null);
    expect(noFold.params.map((p) => p.key)).toEqual(["width", "thickness", "bleed"]); // no box sizes, but the board is still offered
    expect(planResize(null)).toBeNull();
  });

  it("reports the current sizes, and an untouched sheet is the plain scaled one", () => {
    const p = base.params as Record<string, number>;
    expect(p.baseWidth).toBeGreaterThan(0);
    expect(p.baseHeight).toBeGreaterThan(0);
    expect(p.boxHeight).toBeGreaterThan(0);
    // Typing back the current sizes changes nothing.
    const same = gen.generate({ baseWidth: p.baseWidth, baseHeight: p.baseHeight, boxHeight: p.boxHeight });
    expect(same.cutBounds.max.x - same.cutBounds.min.x).toBeCloseTo(base.cutBounds.max.x - base.cutBounds.min.x, 1);
    expect(same.cutBounds.max.y - same.cutBounds.min.y).toBeCloseTo(base.cutBounds.max.y - base.cutBounds.min.y, 1);
  });

  it("changes only the box width when the base width changes", () => {
    const p = base.params as Record<string, number>;
    const [x0, y0, z0] = closedSize(base);
    const [x1, y1, z1] = closedSize(gen.generate({ baseWidth: p.baseWidth! + 20 }));
    expect(x1 - x0).toBeCloseTo(20, 1);
    expect(y1).toBeCloseTo(y0, 1);
    expect(z1).toBeCloseTo(z0, 1);
  });

  it("changes only the box length when the base height changes", () => {
    const p = base.params as Record<string, number>;
    const [x0, y0, z0] = closedSize(base);
    const [x1, y1, z1] = closedSize(gen.generate({ baseHeight: p.baseHeight! + 30 }));
    expect(y1 - y0).toBeCloseTo(30, 1);
    expect(x1).toBeCloseTo(x0, 1);
    expect(z1).toBeCloseTo(z0, 1);
  });

  it("changes only how tall the box stands when the box height changes", () => {
    const p = base.params as Record<string, number>;
    const [x0, y0, z0] = closedSize(base);
    const [x1, y1, z1] = closedSize(gen.generate({ boxHeight: p.boxHeight! + 15 }));
    expect(z1 - z0).toBeCloseTo(15, 1);
    expect(x1).toBeCloseTo(x0, 1);
    expect(y1).toBeCloseTo(y0, 1);
  });

  it("keeps every fold valid after stretching (panels still share their hinge edges)", () => {
    const p = base.params as Record<string, number>;
    const geo = gen.generate({ baseWidth: p.baseWidth! * 1.4, baseHeight: p.baseHeight! * 0.8, boxHeight: p.boxHeight! * 1.7 });
    expect(geo.foldTree.hinges.length).toBe(base.foldTree.hinges.length);
    expect(geo.checks.every((c) => c.pass)).toBe(true);
    // Re-importing the stretched sheet finds the same folds.
    const again = detectFoldSetup(toFlat(geo)).setup;
    expect(validateFoldSetup(again)).toEqual([]);
    expect(again.hinges).toHaveLength(setup.hinges.length);
  });

  it("follows the overall width as well", () => {
    const p = base.params as Record<string, number>;
    const big = gen.generate({ width: ((base.params as { width: number }).width) * 2 });
    expect((big.params as Record<string, number>).baseWidth).toBeCloseTo(p.baseWidth! * 2, 1);
  });

  it("rejects sizes far outside the sheet", () => {
    expect(() => gen.generate({ baseWidth: 100000 })).toThrow(ParamValidationError);
    expect(() => gen.generate({ boxHeight: 0.01 })).toThrow(ParamValidationError);
  });
});
