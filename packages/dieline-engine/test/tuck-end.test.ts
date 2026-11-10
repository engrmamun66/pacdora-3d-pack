import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ParamValidationError,
  area,
  dist,
  outlineArea,
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
    dustFlapCornerRadius: 3,
    cutGapFactor: 1,
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

  it("has the hand-calculated total crease length 4H+4L+4W, less the four cut gaps", () => {
    const g = gen(explicit);
    const total = g.creaseLines.reduce((s, c) => s + dist(c.a, c.b), 0);
    // Thickness 0.5 mm x factor 1 = 0.5 mm gap at each of the four dust flap / closure junctions.
    expect(total).toBeCloseTo(4 * 150 + 4 * 100 + 4 * 50 - 4 * 0.5, 6);
    const none = gen({ ...explicit, cutGapFactor: 0 });
    expect(none.creaseLines.reduce((s, c) => s + dist(c.a, c.b), 0)).toBeCloseTo(4 * 150 + 4 * 100 + 4 * 50, 6);
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
    // Without cut gaps: a reverse bottom has its closure beside only one dust flap, a straight one beside both.
    const a = gen({ ...base, variant: "straight", cutGapFactor: 0 });
    const b = gen({ ...base, variant: "reverse", cutGapFactor: 0 });
    expect(b.cutBounds).toEqual(a.cutBounds);
    expect(outlineArea(b.cutLoops[0]!)).toBeCloseTo(outlineArea(a.cutLoops[0]!), 6);
  });
});

describe("thickness allowance", () => {
  it("adds factor*thickness to each of width, depth and height", () => {
    const plain = gen({ ...base, tuckDepth: 20, dustFlapDepth: 20 });
    const comp = gen({ ...base, tuckDepth: 20, dustFlapDepth: 20, thickness: 0.5, sizeMode: "inner", allowanceFactor: 2 });
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
      f: fc.array(frac(0.05, 1), { minLength: 10, maxLength: 10 }),
      tuckCornerStyle: fc.constantFrom("round", "chamfer"),
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
        tuckSlitLength: f[7]! < 0.3 ? 0 : Math.min(50, f[8]! * 0.2 * r.width),
        dustFlapCornerRadius: Math.min(50, f[9]! * 0.2 * Math.min(r.width, r.depth)),
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

describe("rounded corners, slits and size mode", () => {
  const explicit = {
    ...base,
    glueFlapWidth: 15,
    glueFlapBevel: 3,
    tuckDepth: 25,
    tuckCornerCut: 6,
    dustFlapDepth: 25,
    dustFlapInset: 3,
    dustFlapCornerRadius: 0,
  };

  it("round tuck corners remove exactly 2 r^2 (1 - pi/4) per tuck", () => {
    const round = gen({ ...explicit, tuckCornerStyle: "round" });
    const tuck = round.foldTree.panels.find((p) => p.id === "top-tuck")!;
    expect(outlineArea({ points: tuck.polygon, bulges: tuck.bulges })).toBeCloseTo(100 * 25 - 2 * 36 * (1 - Math.PI / 4), 6);
    expect(round.checks.every((c) => c.pass)).toBe(true);
  });

  it("chamfer style still works and removes 2 * c^2 / 2", () => {
    const ch = gen({ ...explicit, tuckCornerStyle: "chamfer" });
    const tuck = ch.foldTree.panels.find((p) => p.id === "top-tuck")!;
    expect(area(tuck.polygon)).toBeCloseTo(100 * 25 - 36, 6);
  });

  it("slits shorten each tuck crease and appear as cut lines", () => {
    const g = gen({ ...explicit, tuckSlitLength: 4 });
    expect(g.slitLines).toHaveLength(4);
    for (const s of g.slitLines) expect(dist(s.a, s.b)).toBeCloseTo(4, 9);
    const tuckCrease = g.creaseLines.find((c) => c.hingeId === "h-top-tuck")!;
    expect(dist(tuckCrease.a, tuckCrease.b)).toBeCloseTo(100 - 8, 9);
    expect(g.checks.every((c) => c.pass)).toBe(true);
  });

  it("rejects slits that consume the whole crease", () => {
    expect(() => gen({ ...explicit, tuckSlitLength: 45 })).toThrow(ParamValidationError);
  });

  it("rejects a dust flap corner radius that does not fit", () => {
    expect(() => gen({ ...explicit, dustFlapCornerRadius: 30 })).toThrow(ParamValidationError);
  });

  it("inner size mode adds the allowance; manufacture mode ignores none", () => {
    const m = gen({ ...explicit, thickness: 0.5 });
    const i = gen({ ...explicit, thickness: 0.5, sizeMode: "inner", allowanceFactor: 1 });
    const w = (g: typeof m) => g.cutBounds.max.x - g.cutBounds.min.x;
    expect(w(i) - w(m)).toBeCloseTo(4 * 0.5, 9);
    expect(m.unverifiedDefaultsUsed).not.toContain("allowanceFactor");
    expect(gen({ ...explicit, sizeMode: "inner" }).unverifiedDefaultsUsed).toContain("allowanceFactor");
  });

  it("rejects allowanceFactor in manufacture mode (it would be silently ignored)", () => {
    expect(() => gen({ ...explicit, allowanceFactor: 1 })).toThrow(ParamValidationError);
  });
});

describe("cut gap follows the board thickness", () => {
  const hingeLen = (g: DielineGeometry, id: string) => {
    const h = g.foldTree.hinges.find((x) => x.childId === id)!;
    return dist(h.a, h.b);
  };
  const tuned = { ...base, dustFlapInset: 1, dustFlapCornerRadius: 0 };

  it("shortens the dust flap on the closure side by thickness x factor", () => {
    for (const t of [0.5, 1, 3]) {
      const g = gen({ ...tuned, thickness: t, cutGapFactor: 1 });
      expect(g.checks.every((c) => c.pass)).toBe(true);
      expect(hingeLen(g, "dust-right-top")).toBeCloseTo(50 - t, 6);
      expect(hingeLen(g, "dust-left-top")).toBeCloseTo(50 - t, 6);
      // The closure keeps its full width.
      expect(hingeLen(g, "top-closure")).toBeCloseTo(100, 6);
    }
    expect(hingeLen(gen({ ...tuned, thickness: 2, cutGapFactor: 1.5 }), "dust-right-top")).toBeCloseTo(50 - 3, 6);
  });

  it("factor 0 leaves no gap", () => {
    const g = gen({ ...tuned, thickness: 3, cutGapFactor: 0 });
    expect(hingeLen(g, "dust-right-top")).toBeCloseTo(50, 6);
  });

  it("puts the slot bottom on the body edge as its own cut segment", () => {
    const g = gen({ ...tuned, thickness: 3, cutGapFactor: 1 });
    const right = g.foldTree.panels.find((p) => p.id === "right")!;
    // 4 corners + one slot vertex on the top edge and one on the bottom edge.
    expect(right.polygon.length).toBe(6);
    const flat = gen({ ...tuned, thickness: 3, cutGapFactor: 0 });
    expect(flat.foldTree.panels.find((p) => p.id === "right")!.polygon.length).toBe(4);
  });

  it("reverse bottom: only the dust flap beside the front closure is shortened", () => {
    const g = gen({ ...tuned, variant: "reverse", thickness: 3, cutGapFactor: 1 });
    expect(hingeLen(g, "dust-right-bottom")).toBeCloseTo(47, 6);
    expect(hingeLen(g, "dust-left-bottom")).toBeCloseTo(50, 6);
  });

  it("rejects a gap wider than a quarter of the depth", () => {
    expect(() => gen({ ...base, thickness: 5, cutGapFactor: 5 })).toThrow(ParamValidationError);
  });
});
