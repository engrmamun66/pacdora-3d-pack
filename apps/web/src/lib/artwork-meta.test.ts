import { describe, expect, it } from "vitest";
import { MAX_NAME, MAX_TAGS, MAX_TAG_LENGTH, cleanCategory, cleanName, numberedNames, parseTags } from "./artwork-meta";

describe("parseTags", () => {
  it("splits on comma, semicolon and new line, lower-cases and drops empties and repeats", () => {
    expect(parseTags("Gift, Logo;gold\n\n  GIFT , ,")).toEqual(["gift", "logo", "gold"]);
  });
  it("strips a leading # and collapses spaces inside a tag", () => {
    expect(parseTags("#sale,  summer   pattern")).toEqual(["sale", "summer pattern"]);
  });
  it("limits count and length", () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(",");
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
    expect(parseTags("x".repeat(100))[0]).toHaveLength(MAX_TAG_LENGTH);
  });
  it("accepts a list", () => {
    expect(parseTags(["A", "a", " b "])).toEqual(["a", "b"]);
  });
});

describe("names", () => {
  it("tidies and cuts", () => {
    expect(cleanName("  Gold   star ")).toBe("Gold star");
    expect(cleanName("n".repeat(500))).toHaveLength(MAX_NAME);
    expect(cleanCategory("  Holiday  ")).toBe("Holiday");
  });
});

describe("numberedNames", () => {
  it("keeps a single name as it is", () => {
    expect(numberedNames("  Gold  star ", 1)).toEqual(["Gold star"]);
  });
  it("adds 1, 2, 3 after the name for several", () => {
    expect(numberedNames("Star", 3)).toEqual(["Star 1", "Star 2", "Star 3"]);
  });
  it("always fits the number in the length limit", () => {
    const names = numberedNames("n".repeat(200), 12);
    expect(names).toHaveLength(12);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(MAX_NAME);
    expect(names[11]!.endsWith(" 12")).toBe(true);
  });
});
