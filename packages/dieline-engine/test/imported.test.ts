import { describe, expect, it } from "vitest";
import { ImportedDielineError, ParamValidationError, createImportedGenerator, importedDefaults, type FlatDieline } from "../src";

const rect = (x: number, y: number, w: number, h: number) => ({ pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true });
// A 100 x 60 sheet with a hole, a slit, one fold line, a drawn bleed 4 mm outside, and a safe-area guide.
const flat: FlatDieline = {
  cut: [rect(10, 10, 100, 60), rect(30, 30, 10, 10), { pts: [60, 10, 60, 25], closed: false }],
  crease: [{ pts: [50, 10, 50, 70], closed: false }],
  bleed: [rect(6, 6, 108, 68)],
  guide: [rect(15, 15, 90, 50)],
};

describe("imported dieline generator", () => {
  const gen = createImportedGenerator("t1", flat);

  it("defaults: original width, and the bleed the file drew", () => {
    expect(importedDefaults(flat)).toEqual({ width: 100, bleed: 4 });
    const g = gen.generate({});
    expect(g.cutBounds.max.x - g.cutBounds.min.x).toBeCloseTo(100, 6);
    expect(g.params).toEqual({ width: 100, bleed: 4 });
    expect(g.bleedBounds.max.x - g.bleedBounds.min.x).toBeCloseTo(108, 3);
  });

  it("sorts lines into loops, slits, folds, safe areas", () => {
    const g = gen.generate({});
    expect(g.cutLoops).toHaveLength(2); // outline + hole
    expect(g.slitLines).toHaveLength(1);
    expect(g.creaseLines).toHaveLength(1);
    expect(g.safeAreas).toHaveLength(1);
    expect(g.foldTree.panels).toHaveLength(1);
    expect(g.foldTree.hinges).toHaveLength(0);
    expect(g.annotations).toHaveLength(2);
  });

  it("scales the whole sheet uniformly from the width", () => {
    const g = gen.generate({ width: 200, bleed: 0 });
    expect(g.cutBounds.max.x - g.cutBounds.min.x).toBeCloseTo(200, 6);
    expect(g.cutBounds.max.y - g.cutBounds.min.y).toBeCloseTo(120, 6);
    const c = g.creaseLines[0]!;
    expect(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)).toBeCloseTo(120, 6);
    expect(g.bleedBounds).toEqual(g.cutBounds);
  });

  it("is deterministic and JSON-safe", () => {
    expect(JSON.stringify(gen.generate({ width: 150 }))).toBe(JSON.stringify(gen.generate({ width: 150 })));
  });

  it("rejects out-of-range or non-numeric input with issues", () => {
    expect(() => gen.generate({ width: 1 })).toThrow(ParamValidationError);
    expect(() => gen.generate({ width: 99999 })).toThrow(ParamValidationError);
    expect(() => gen.generate({ bleed: -1 })).toThrow(ParamValidationError);
    expect(() => gen.generate({ width: "wide" })).toThrow(ParamValidationError);
  });

  it("refuses a dieline without a closed cut outline", () => {
    expect(() => createImportedGenerator("t2", { cut: [{ pts: [0, 0, 10, 0, 10, 10], closed: false }], crease: [], bleed: [], guide: [] })).toThrow(ImportedDielineError);
  });

  it("descriptors match the schema keys", () => {
    expect(gen.params.map((p) => p.key)).toEqual(gen.schemaKeys);
  });
});
