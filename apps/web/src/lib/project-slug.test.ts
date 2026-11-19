import { describe, expect, it } from "vitest";
import { firstFree, isProjectSlug, projectSlug, SLUG_MAX } from "./project-slug";

describe("projectSlug", () => {
  it("makes dashes from anything that is not a letter or a digit", () => {
    expect(projectSlug("Crash-lock bottom box")).toBe("crash-lock-bottom-box");
    expect(projectSlug("  Box   #2 (final)! ")).toBe("box-2-final");
    expect(projectSlug("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("never returns nothing, and stays within the limit", () => {
    expect(projectSlug("")).toBe("project");
    expect(projectSlug("!!!")).toBe("project");
    expect(projectSlug("বাক্স")).toBe("project");
    const long = projectSlug("a ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(long.endsWith("-")).toBe(false);
  });

  it("knows a slug from other text", () => {
    expect(isProjectSlug("my-box-2")).toBe(true);
    for (const t of ["", "My-Box", "my--box", "-box", "box-", "my box"]) expect(isProjectSlug(t)).toBe(false);
  });
});

describe("firstFree", () => {
  it("keeps the base when free, else counts up", () => {
    expect(firstFree("box", () => false)).toBe("box");
    expect(firstFree("box", (c) => c === "box")).toBe("box-2");
    expect(firstFree("box", (c) => ["box", "box-2", "box-3"].includes(c))).toBe("box-4");
  });

  it("keeps the result within the limit", () => {
    const base = "a".repeat(SLUG_MAX);
    const r = firstFree(base, (c) => c === base);
    expect(r.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(r.endsWith("-2")).toBe(true);
  });
});
