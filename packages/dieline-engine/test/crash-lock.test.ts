import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ParamValidationError,
  buildCrashLockTree,
  crashLockChecks,
  dist,
  foldTree,
  generateDieline,
  resolveCrashLockParams,
  type FoldTree,
} from "../src";

const gen = (input: unknown) => generateDieline("crash-lock-carton", input);
const base = { width: 80, depth: 60, height: 120 };

describe("crash-lock bottom carton", () => {
  it("default preset passes every check, including the closed-bottom checks", () => {
    const g = gen(base);
    expect(g.checks.every((c) => c.pass)).toBe(true);
    const names = g.checks.map((c) => c.name);
    for (const n of [
      "folded-bottom-flat",
      "folded-bottom-covered",
      "folded-outer-flaps-no-overlap",
      "folded-lock-flaps-no-overlap",
      "folded-glue-tab-front-on-lock",
      "folded-glue-tab-back-on-lock",
      "folded-lock-right-engages",
      "folded-lock-left-engages",
      "folded-top-closure-closes",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("has two 45 degree glue-tab creases folding 180 degrees, each W/2 * sqrt(2) long", () => {
    const g = gen(base);
    const tabs = g.creaseLines.filter((c) => c.hingeId.startsWith("h-glue-tab-"));
    expect(tabs).toHaveLength(2);
    for (const c of tabs) {
      expect(c.foldAngleDeg).toBe(180);
      expect(dist(c.a, c.b)).toBeCloseTo(30 * Math.SQRT2, 9);
      expect(Math.abs(c.b.x - c.a.x)).toBeCloseTo(Math.abs(c.b.y - c.a.y), 9);
    }
  });

  it("marks the glue tabs as glue areas and cuts them free of the lock flaps", () => {
    const g = gen(base);
    expect(g.glueAreas.map((a) => a.panelId).sort()).toEqual(["glue", "glue-tab-back", "glue-tab-front"]);
    expect(g.slitLines.map((s) => s.id).sort()).toEqual(["slit-tab-back", "slit-tab-front"]);
    for (const s of g.slitLines) expect(dist(s.a, s.b)).toBeCloseTo(30, 9);
  });

  it("bottom adds exactly depth/2 below the body", () => {
    const tuck = generateDieline("tuck-end-carton", base);
    const g = gen(base);
    const h = (x: typeof g) => x.cutBounds.max.y - x.cutBounds.min.y;
    // Same top and body; tuck-end bottom reaches max(W + tuck, dust), crash-lock only W/2.
    const tp = tuck.params as { tuckDepth: number; dustFlapDepth: number };
    expect(h(tuck) - h(g)).toBeCloseTo(Math.max(60 + tp.tuckDepth, tp.dustFlapDepth) - 30, 9);
  });

  it("taper 0 and no cut gap turn the shared edge between right lock flap and back flap into a slit", () => {
    const g = gen({ ...base, lockFlapTaper: 0, cutGapFactor: 0 });
    expect(g.checks.every((c) => c.pass)).toBe(true);
    expect(g.slitLines.map((s) => s.id)).toContain("slit-lock-right");
  });

  it("right lock flap stops one cut gap (thickness x factor) short of the back flap", () => {
    const hinge = (g: ReturnType<typeof gen>, id: string) => {
      const h = g.foldTree.hinges.find((x) => x.childId === id)!;
      return dist(h.a, h.b);
    };
    for (const t of [0.5, 1.5, 3]) {
      const g = gen({ ...base, thickness: t, cutGapFactor: 1 });
      expect(g.checks.every((c) => c.pass)).toBe(true);
      expect(hinge(g, "lock-right")).toBeCloseTo(60 - t, 6);
      expect(hinge(g, "lock-left")).toBeCloseTo(60, 6);
      // No slit replaces the gap, and the tab slits stay.
      expect(g.slitLines.map((s) => s.id)).not.toContain("slit-lock-right");
      expect(g.slitLines.map((s) => s.id)).toContain("slit-tab-front");
    }
    expect(hinge(gen({ ...base, thickness: 3, cutGapFactor: 0 }), "lock-right")).toBeCloseTo(60, 6);
  });

  it("square footprint (depth = width) still closes", () => {
    const g = gen({ width: 60, depth: 60, height: 100 });
    expect(g.checks.every((c) => c.pass)).toBe(true);
  });

  it("rejects depth > width (side flaps would overlap)", () => {
    expect(() => gen({ width: 50, depth: 60, height: 100 })).toThrow(ParamValidationError);
    try {
      gen({ width: 50, depth: 60, height: 100 });
    } catch (e) {
      expect((e as ParamValidationError).issues.map((i) => i.path)).toContain("depth");
    }
  });

  it("rejects a taper that would uncover the glue tab", () => {
    expect(() => gen({ ...base, lockFlapTaper: 31 })).toThrow(ParamValidationError);
  });

  it("rejects a safe margin too large for the bottom flaps", () => {
    expect(() => gen({ ...base, safeMargin: 15 })).toThrow(ParamValidationError);
  });

  it("does not accept the tuck-end-only 'variant' key silently", () => {
    // zod strips unknown keys; the result is still a valid crash-lock carton.
    const g = gen({ ...base, variant: "reverse" });
    expect((g.params as Record<string, unknown>).variant).toBeUndefined();
  });

  it("reports the taper default as unverified", () => {
    expect(gen(base).unverifiedDefaultsUsed).toContain("lockFlapTaper");
    expect(gen({ ...base, lockFlapTaper: 2 }).unverifiedDefaultsUsed).not.toContain("lockFlapTaper");
  });
});

describe("crash-lock checks catch broken geometry", () => {
  const { params } = resolveCrashLockParams(base);
  const withTree = (mutate: (t: FoldTree) => FoldTree) => {
    const tree = mutate(buildCrashLockTree(params));
    return crashLockChecks(params, tree, foldTree(tree));
  };
  const failing = (r: ReturnType<typeof withTree>) => r.filter((c) => !c.pass).map((c) => c.name);

  it("intact tree passes", () => {
    expect(failing(withTree((t) => t))).toEqual([]);
  });

  it("glue tab folded 90 instead of 180 degrees is detected", () => {
    const bad = withTree((t) => ({
      ...t,
      hinges: t.hinges.map((h) => (h.id === "h-glue-tab-front" ? { ...h, foldAngleDeg: 90 } : h)),
    }));
    expect(failing(bad)).toContain("folded-bottom-flat");
    expect(failing(bad)).toContain("folded-glue-tab-front-on-lock");
  });

  it("a lock flap left unfolded is detected", () => {
    const bad = withTree((t) => ({
      ...t,
      hinges: t.hinges.map((h) => (h.id === "h-lock-left" ? { ...h, foldAngleDeg: 0 } : h)),
    }));
    expect(failing(bad)).toEqual(expect.arrayContaining(["folded-bottom-flat", "folded-bottom-covered"]));
  });
});

describe("crash-lock property test", () => {
  const arb = fc
    .record({
      width: fc.double({ min: 30, max: 600, noNaN: true }),
      ratio: fc.double({ min: 0.4, max: 1, noNaN: true }),
      height: fc.double({ min: 15, max: 600, noNaN: true }),
      // Integer-based fractions: fc.double over [0, 1] mostly yields subnormal numbers.
      taper: fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000),
      sizeMode: fc.constantFrom("manufacture", "inner"),
      tuckSlit: fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000),
    })
    .map(({ ratio, taper, tuckSlit, ...r }) => {
      const depth = Math.min(r.width, r.width * ratio);
      return {
        width: r.width,
        depth,
        height: r.height,
        sizeMode: r.sizeMode,
        lockFlapTaper: Math.min(100, taper * 0.5 * depth),
        tuckSlitLength: tuckSlit < 0.5 ? 0 : Math.min(50, tuckSlit * 0.1 * r.width),
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
          if (e instanceof ParamValidationError) return true;
          throw e;
        }
      }),
      { numRuns: 300 },
    );
    expect(valid).toBeGreaterThan(200);
  });
});

describe("defaults on short boxes", () => {
  it("default tuck depth stays below the height, so defaults alone never fail", () => {
    for (const id of ["tuck-end-carton", "crash-lock-carton"]) {
      const g = generateDieline(id, { width: 80, depth: 60, height: 20 });
      expect(g.checks.every((c) => c.pass)).toBe(true);
      expect((g.params as { tuckDepth: number }).tuckDepth).toBeLessThan(20);
    }
  });
});
