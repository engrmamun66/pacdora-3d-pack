import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import { SAMPLE_BOXES, SAMPLE_STYLES } from "./sample-boxes";

describe("sample boxes", () => {
  it("has at least four, with unique ids", () => {
    expect(SAMPLE_BOXES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(SAMPLE_BOXES.map((b) => b.id)).size).toBe(SAMPLE_BOXES.length);
  });

  it("makes a valid dieline for each", () => {
    for (const b of SAMPLE_BOXES) expect(() => generateDieline(b.generatorId, b.params), b.id).not.toThrow();
  });
});

describe("sample styles", () => {
  it("starts with None (the plain board), then a solid colour and a gradient", () => {
    expect(SAMPLE_STYLES[0]!.id).toBe("none");
    expect(SAMPLE_STYLES[0]!.gradient).toBeUndefined();
    expect(SAMPLE_STYLES.some((x) => x.gradient)).toBe(true);
    expect(SAMPLE_STYLES.some((x, i) => i > 0 && !x.gradient)).toBe(true);
  });

  it("has unique ids and valid colours", () => {
    expect(new Set(SAMPLE_STYLES.map((x) => x.id)).size).toBe(SAMPLE_STYLES.length);
    for (const x of SAMPLE_STYLES) expect([x.outside, x.inside, ...(x.gradient ? [x.gradient.from, x.gradient.to] : [])].every((c) => /^#[0-9a-f]{6}$/i.test(c)), x.id).toBe(true);
  });
});
