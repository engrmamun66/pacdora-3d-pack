import { describe, expect, it } from "vitest";
import { generators, templateCatalog, getGenerator, getPreset } from "../src";

describe("generator registry", () => {
  for (const gen of Object.values(generators)) {
    it(`${gen.id}: form descriptors match the input schema exactly`, () => {
      const described = gen.params.map((p) => p.key).sort();
      expect(described).toEqual([...gen.schemaKeys].sort());
    });

    it(`${gen.id}: showWhen references existing enum values`, () => {
      for (const p of gen.params) {
        if (!p.showWhen) continue;
        const target = gen.params.find((q) => q.key === p.showWhen!.key);
        expect(target?.kind).toBe("enum");
        if (target?.kind === "enum") expect(target.options.map((o) => o.value)).toContain(p.showWhen.equals);
      }
    });
  }
});

describe("template catalogue", () => {
  it("has unique ids", () => {
    const ids = templateCatalog.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const t of templateCatalog) {
    it(`${t.id}: defaults generate a fully valid dieline`, () => {
      const g = getGenerator(t.generatorId).generate(t.defaults);
      expect(g.checks.every((c) => c.pass)).toBe(true);
    });
  }

  it("getPreset finds presets and returns undefined otherwise", () => {
    expect(getPreset("straight-tuck-end-box")?.generatorId).toBe("tuck-end-carton");
    expect(getPreset("nope")).toBeUndefined();
  });
});
