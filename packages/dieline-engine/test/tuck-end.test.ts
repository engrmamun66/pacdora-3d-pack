import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ParamValidationError,
  area,
  dist,
  generateDieline,
  type DielineGeometry,
} from "../src";

const T = "tuck-end-carton";
const base = { width: 100, depth: 50, height: 150 };
const gen = (input: unknown): DielineGeometry => generateDieline(T, input);

describe("tuck-end carton, explicit hand-calculated reference", () => {
  // Every parameter given, so the numbers below can be verified by hand.
  const explicit = {
    ...base,
    glueFlapWidth: 15,
    glueFlapBevel: 3,
    tuckDepth: 25,
    tuckCornerCut: 4,
    dustFlapDepth: 25,
    dustFlapInset: 3,
    bleed: 3,
    safeMargin: 3,
  };

  it("produces the hand-calculated sheet size", () => {
    const g = gen(explicit);
    const w = g.cutBounds.max.x - g.cutBounds.min.x;
    const h = g.cutBounds.max.y - g.cutBounds.min.y;
    expect(w).toBeCloseTo(15 + 2 * 100 + 2 * 50, 6); // 315
    expect(h).toBeCloseTo(150 + 2 * (50 + 25), 6); // 300
    expect(g.unverifiedDefaultsUsed).toEqual([]);
  });

  it("has all invariants passing", () => {
    const g = gen(explicit);
    expect(g.checks.every((c) => c.pass)).toBe(true);
    expect(g.checks.length).toBeGreaterThanOrEqual(9);
  });

  it("has 13 panels, 12 hinges and one cut loop", () => {
    const g = gen(explicit);
    expect(g.foldTree.panels).toHaveLength(13);
    expect(g.foldTree.hinges).toHaveLength(12);
    expect(g.cutLoops).toHaveLength(1);
  });

  it("has the hand-calculated total crease length 4H+4L+4W", () => {
    const g = gen(explicit);
    const total = g.creaseLines.reduce((s, c) => s + dist(c.a, c.b), 0);
    expect(total).toBeCloseTo(4 * 150 + 4 * 100 + 4 * 50, 6);
  });

  it("body panel areas match W*H and L*H", () => {
    const g = gen(explicit);
    const byId = (id: string) => g.foldTree.panels.find((p) => p.id === id)!;
    expect(area(byId("front").polygon)).toBeCloseTo(100 * 150, 6);
    expect(area(byId("right").polygon)).toBeCloseTo(50 * 150, 6);
    expect(area(byId("back").polygon)).toBeCloseTo(100 * 150, 6);
    expect(area(byId("left").polygon)).toBeCloseTo(50 * 150, 6);
    expect(area(byId("top-closure").polygon)).toBeCloseTo(100 * 50, 6);
  });

  it("puts the safe area exactly safeMargin inside the front panel", () => {
    const g = gen(explicit);
    const safe = g.safeAreas.find((s) => s.panelId === "front")!;
    expect(area(safe.polygon)).toBeCloseTo((100 - 6) * (150 - 6), 4);
  });

  it("grows the bleed outline by exactly the bleed distance", () => {
    const g = gen(explicit);
    expect(g.bleedBounds.min.x).toBeCloseTo(0, 3);
    expect(g.bleedBounds.min.y).toBeCloseTo(0, 3);
    expect(g.bleedBounds.max.x).toBeCloseTo(315 + 6, 3);
    expect(g.bleedBounds.max.y).toBeCloseTo(300 + 6, 3);
  });
});

describe("variants", () => {
  it("straight: both closures hang from the back panel", () => {
    const g = gen({ ...base, variant: "straight" });
    const hinge = (id: string) => g.foldTree.hinges.find((h) => h.childId === id)!;
    expect(hinge("top-closure").parentId).toBe("back");
    expect(hinge("bottom-closure").parentId).toBe("back");
  });

  it("reverse: bottom closure hangs from the front panel", () => {
    const g = gen({ ...base, variant: "reverse" });
    const hinge = (id: string) => g.foldTree.hinges.find((h) => h.childId === id)!;
    expect(hinge("top-closure").parentId).toBe("back");
    expect(hinge("bottom-closure").parentId).toBe("front");
  });

  it("both variants have the same sheet size and total cut area", () => {
    const a = gen({ ...base, variant: "straight" });
    const b = gen({ ...base, variant: "reverse" });
    expect(b.cutBounds).toEqual(a.cutBounds);
    expect(area(b.cutLoops[0]!)).toBeCloseTo(area(a.cutLoops[0]!), 6);
  });
});

describe("thickness allowance", () => {
  it("adds factor*thickness to each of width, depth and height", () => {
    const plain = gen({ ...base, tuckDepth: 20, dustFlapDepth: 20 });
    const comp = gen({ ...base, tuckDepth: 20, dustFlapDepth: 20, thickness: 0.5, allowanceFactor: 2 });
    const wPlain = plain.cutBounds.max.x - plain.cutBounds.min.x;
    const wComp = comp.cutBounds.max.x - comp.cutBounds.min.x;
    expect(wComp - wPlain).toBeCloseTo(4 * 1.0, 6); // 4 vertical body panels, k = 1.0
  });
});

describe("input validation", () => {
  it.each([
    ["negative width", { ...base, width: -5 }],
    ["zero height", { ...base, height: 0 }],
    ["NaN depth", { ...base, depth: Number.NaN }],
    ["missing depth", { width: 100, height: 150 }],
    ["string width", { ...base, width: "100" }],
    ["unknown variant", { ...base, variant: "diagonal" }],
    ["tuck deeper than box", { ...base, tuckDepth: 60 }],
    ["tuck longer than height", { width: 100, depth: 80, height: 30, tuckDepth: 30 }],
    ["dust flaps that collide", { ...base, dustFlapDepth: 50 }],
    ["glue flap wider than side", { ...base, glueFlapWidth: 60 }],
    ["safe margin too large", { ...base, safeMargin: 20 }],
    ["glue bevel as big as flap", { ...base, glueFlapWidth: 10, glueFlapBevel: 10 }],
    ["bleed below geometry resolution", { ...base, bleed: 1e-9 }],
    ["safe margin below geometry resolution", { ...base, safeMargin: 1e-9 }],
  ])("rejects %s", (_name, input) => {
    expect(() => gen(input)).toThrow(ParamValidationError);
  });

  it("rejects unknown templates", () => {
    expect(() => generateDieline("nope", base)).toThrow(/Unknown template/);
  });

  it("never throws a validation error for in-range defaults", () => {
    expect(() => gen(base)).not.toThrow();
  });

  it("reports which defaults were unverified", () => {
    expect(gen(base).unverifiedDefaultsUsed).toContain("tuckDepth");
  });
});

describe("property: any valid parameter set yields a fully valid dieline", () => {
  const frac = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true });
  const arb = fc
    .record({
      variant: fc.constantFrom("straight", "reverse"),
      width: frac(20, 500),
      depth: frac(20, 500),
      height: frac(20, 500),
      bleed: frac(0, 10).map((b) => (b < 0.01 ? 0 : b)),
      f: fc.array(frac(0.05, 1), { minLength: 7, maxLength: 7 }),
    })
    .map(({ f, ...r }) => {
      // Clamp to the schema ranges so float rounding never produces e.g. 100.00000000000001.
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      const tuckDepth = clamp(f[0]! * r.depth, 2, Math.min(500, r.depth, r.height * 0.99));
      const glueFlapWidth = clamp(f[1]! * r.depth, 2, Math.min(100, r.depth));
      return {
        ...r,
        tuckDepth,
        glueFlapWidth,
        glueFlapBevel: clamp(f[2]! * 0.9 * Math.min(glueFlapWidth, r.height / 2.1), 0, 50),
        tuckCornerCut: clamp(f[3]! * 0.9 * Math.min(tuckDepth, r.width / 2.1), 0, 50),
        dustFlapDepth: clamp(f[4]! * 0.45 * r.width, 2, 500),
        dustFlapInset: clamp(f[5]! * 0.45 * r.depth, 0, 100),
        safeMargin: ((m) => (m < 0.01 ? 0 : Math.min(20, m)))(f[6]! * 0.45 * Math.min(r.width, r.depth, r.height, tuckDepth)),
      };
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
          // Clean rejection of an inconsistent combination is acceptable;
          // DielineBuildError / DielineValidationError / anything else is a bug.
          if (e instanceof ParamValidationError) return true;
          throw e;
        }
      }),
      { numRuns: 300 },
    );
    // Guard against the generator drifting into mostly-invalid territory.
    expect(valid).toBeGreaterThan(240);
  });
});
