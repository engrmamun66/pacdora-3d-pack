import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import { SAMPLE_BOXES } from "./sample-boxes";

describe("sample boxes", () => {
  it("has at least four, with unique ids", () => {
    expect(SAMPLE_BOXES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(SAMPLE_BOXES.map((b) => b.id)).size).toBe(SAMPLE_BOXES.length);
  });

  it("makes a valid dieline for each", () => {
    for (const b of SAMPLE_BOXES) expect(() => generateDieline(b.generatorId, b.params), b.id).not.toThrow();
  });
});
