import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it("makes clean slugs", () => {
    expect(slugify("Milk & Yogurt")).toBe("milk-yogurt");
    expect(slugify("  Cards & Tags ")).toBe("cards-tags");
    expect(slugify("Boxes with Lid")).toBe("boxes-with-lid");
    expect(slugify("Café Box #2")).toBe("cafe-box-2");
    expect(slugify("---")).toBe("");
  });
  it("validates slugs", () => {
    expect(isValidSlug("tuck-end-box")).toBe(true);
    expect(isValidSlug("Tuck")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
  });
});
