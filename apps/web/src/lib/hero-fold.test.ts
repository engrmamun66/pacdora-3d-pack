import { describe, expect, it } from "vitest";
import { CYCLE_SECONDS, START_OFFSET, STILL_STAGE, hingeProgressAt, stageAt, stagedHinges } from "./hero-fold";

describe("staged hero fold", () => {
  it("body is fully built before the lid starts to close, and the lid is last", () => {
    expect(hingeProgressAt("body", 0.5)).toBe(1);
    expect(hingeProgressAt("closure", 0.5)).toBe(0);
    expect(hingeProgressAt("tuck", 0.5)).toBe(0);
    expect(hingeProgressAt("dust-flap", 0.5)).toBe(0);
    // while the lid closes the tuck trails the closure panel
    expect(hingeProgressAt("closure", 0.8)).toBeGreaterThan(hingeProgressAt("tuck", 0.8));
    expect(hingeProgressAt("closure", 1)).toBe(1);
    expect(hingeProgressAt("tuck", 1)).toBe(1);
  });

  it("opening the lid (t 1 -> 0.5): tuck pulls out first, then the lid lifts; the body never moves", () => {
    expect(hingeProgressAt("body", 0.9)).toBe(1);
    expect(hingeProgressAt("tuck", 0.9)).toBeLessThan(1);
    expect(hingeProgressAt("closure", 0.9)).toBe(1);
    expect(hingeProgressAt("closure", 0.7)).toBeLessThan(1);
    expect(hingeProgressAt("body", 0.6)).toBe(1);
  });

  it("every hinge goes from flat (0) to closed (1)", () => {
    for (const role of ["body", "glue-flap", "closure", "tuck", "dust-flap"]) {
      expect(hingeProgressAt(role, 0)).toBe(0);
      expect(hingeProgressAt(role, 1)).toBe(1);
    }
    expect(stagedHinges([{ id: "h1", childRole: "tuck" }], 1)).toEqual({ h1: 1 });
  });

  it("the loop is continuous, bounded, and starts at the chosen poses", () => {
    expect(stageAt(0)).toBe(1);
    expect(stageAt(START_OFFSET["lid-open"])).toBeCloseTo(STILL_STAGE["lid-open"], 6);
    expect(stageAt(START_OFFSET.flat)).toBeCloseTo(STILL_STAGE.flat, 6);
    let prev = stageAt(0);
    for (let s = 0.01; s <= CYCLE_SECONDS * 2; s += 0.01) {
      const v = stageAt(s);
      expect(v).toBeGreaterThanOrEqual(0.04 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(v - prev)).toBeLessThan(0.02); // no jumps
      prev = v;
    }
    expect(stageAt(CYCLE_SECONDS)).toBeCloseTo(stageAt(0), 9);
  });
});
