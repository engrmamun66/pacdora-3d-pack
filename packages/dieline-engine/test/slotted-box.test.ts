import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ParamValidationError,
  buildSlottedBoxTree,
  dist,
  foldTree,
  generateDieline,
  resolveSlottedBoxParams,
  slottedBoxChecks,
  slottedBoxLayout,
  type FoldTree,
} from "../src";

const gen = (input: unknown) => generateDieline("slotted-box", input);
const base = { width: 300, depth: 200, height: 200 };

describe("regular slotted container (FEFCO 0201)", () => {
  it("default preset passes every check, including both closed ends", () => {
    const g = gen(base);
    expect(g.checks.every((c) => c.pass)).toBe(true);
    const names = g.checks.map((c) => c.name);
    for (const end of ["top", "bottom"]) {
      expect(names).toEqual(expect.arrayContaining([`folded-${end}-flat`, `folded-${end}-covered`, `folded-${end}-no-overlap`]));
      expect(names).toEqual(expect.arrayContaining([`folded-${end}-front-closes`, `folded-${end}-back-closes`]));
    }
  });

  it("sheet is (glue + 2L + 2W) x (H + W)", () => {
    const g = gen({ ...base, glueFlapWidth: 30 });
    expect(g.cutBounds.max.x - g.cutBounds.min.x).toBeCloseTo(30 + 1000, 9);
    expect(g.cutBounds.max.y - g.cutBounds.min.y).toBeCloseTo(400, 9);
  });

  it("every flap is W/2 deep and its hinge is the panel width minus one slot", () => {
    const g = gen({ ...base, slotWidth: 8 });
    const flaps = g.creaseLines.filter((c) => /^h-(top|bottom)-/.test(c.hingeId));
    expect(flaps).toHaveLength(8);
    for (const c of flaps) {
      const major = /front|back/.test(c.hingeId);
      expect(dist(c.a, c.b)).toBeCloseTo((major ? 300 : 200) - 8, 9);
    }
    const flap = g.foldTree.panels.find((p) => p.id === "top-right")!;
    const ys = flap.polygon.map((v) => v.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(100, 9);
  });

  it("slot width 0 separates neighbouring flaps with slits", () => {
    const g = gen({ ...base, slotWidth: 0 });
    expect(g.checks.every((c) => c.pass)).toBe(true);
    expect(g.slitLines).toHaveLength(6);
    for (const s of g.slitLines) expect(dist(s.a, s.b)).toBeCloseTo(100, 9);
  });

  it("square box (depth = width) closes; depth > width is rejected", () => {
    expect(gen({ width: 200, depth: 200, height: 150 }).checks.every((c) => c.pass)).toBe(true);
    expect(() => gen({ width: 200, depth: 250, height: 150 })).toThrow(ParamValidationError);
  });

  it("rejects slots that would eat the flaps", () => {
    expect(() => gen({ ...base, slotWidth: 30, depth: 50, width: 100 })).toThrow(ParamValidationError);
  });

  it("default slot is 2 x thickness and is reported as unverified", () => {
    const g = gen({ ...base, thickness: 4 });
    expect((g.params as { slotWidth: number }).slotWidth).toBe(8);
    expect(g.unverifiedDefaultsUsed).toContain("slotWidth");
  });

  it("inner size mode grows every panel by the allowance", () => {
    const m = gen({ ...base, glueFlapWidth: 30 });
    const i = gen({ ...base, glueFlapWidth: 30, sizeMode: "inner", allowanceFactor: 1, thickness: 3 });
    const w = (g: typeof m) => g.cutBounds.max.x - g.cutBounds.min.x;
    expect(w(i) - w(m)).toBeCloseTo(4 * 3, 9);
  });
});

describe("slotted box checks catch broken geometry", () => {
  const { params } = resolveSlottedBoxParams(base);
  const layout = slottedBoxLayout(params);
  const run = (mutate: (t: FoldTree) => FoldTree) => {
    const tree = mutate(buildSlottedBoxTree(params));
    return slottedBoxChecks(layout, params.slotWidth, tree, foldTree(tree))
      .filter((c) => !c.pass)
      .map((c) => c.name);
  };

  it("intact tree passes", () => {
    expect(run((t) => t)).toEqual([]);
  });

  it("an unfolded minor flap is detected", () => {
    const bad = run((t) => ({ ...t, hinges: t.hinges.map((h) => (h.id === "h-top-right" ? { ...h, foldAngleDeg: 0 } : h)) }));
    expect(bad).toEqual(expect.arrayContaining(["folded-top-flat", "folded-top-covered"]));
  });

  it("an over-folded major flap is detected", () => {
    const bad = run((t) => ({ ...t, hinges: t.hinges.map((h) => (h.id === "h-bottom-back" ? { ...h, foldAngleDeg: 120 } : h)) }));
    expect(bad).toContain("folded-bottom-flat");
  });
});

describe("slotted box property test", () => {
  const frac = fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000);
  const arb = fc
    .record({
      width: fc.double({ min: 60, max: 2000, noNaN: true }),
      ratio: fc.double({ min: 0.3, max: 1, noNaN: true }),
      height: fc.double({ min: 40, max: 2000, noNaN: true }),
      thickness: fc.constantFrom(1.5, 3, 4, 7),
      slot: frac,
      sizeMode: fc.constantFrom("manufacture", "inner"),
    })
    .map(({ ratio, slot, ...r }) => {
      const depth = r.width * ratio;
      return { ...r, depth, slotWidth: Math.min(30, slot * 0.45 * depth) };
    });

  it("300 random inputs: each is either rejected as a parameter error or fully valid", () => {
    let valid = 0;
    fc.assert(
      fc.property(arb, (input) => {
        try {
          const g = gen(input);
          valid++;
          return g.checks.every((c) => c.pass);
        } catch (e) {
          if (e instanceof ParamValidationError) return true;
          throw e;
        }
      }),
      { numRuns: 300 },
    );
    expect(valid).toBeGreaterThan(240);
  });
});
