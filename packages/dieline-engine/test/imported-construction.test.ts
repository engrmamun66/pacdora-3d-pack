import { describe, expect, it } from "vitest";
import {
  type DielineGeometry,
  type FlatDieline,
  type FlatPath,
  type FoldSetup,
  ParamValidationError,
  createImportedGenerator,
  creaseSizesOf,
  flatPoint,
  flattenOutline,
  foldTree,
  fullPlan,
  generateDieline,
  planResize,
  predictNames,
  resolveConstruction,
  transformPoint,
  validateFoldSetup,
} from "../src";

const toFlat = (geo: DielineGeometry): FlatDieline => ({
  cut: [
    ...geo.cutLoops.map((o): FlatPath => ({ pts: flattenOutline(o).flatMap((p) => [p.x, p.y]), closed: true })),
    ...geo.slitLines.map((s): FlatPath => ({ pts: [s.a.x, s.a.y, s.b.x, s.b.y], closed: false })),
  ],
  crease: geo.creaseLines.map((c): FlatPath => ({ pts: [c.a.x, c.a.y, c.b.x, c.b.y], closed: false })),
  bleed: [],
  guide: [],
});

/** The built-in carton's own panels and hinges as a fold setup, with the roles the generator gave them. */
const setupOf = (geo: DielineGeometry): FoldSetup => ({
  rootId: geo.foldTree.rootId,
  panels: geo.foldTree.panels.map((p) => ({
    id: p.id,
    label: p.label,
    role: p.role,
    printable: p.printable,
    polygon: flattenOutline({ points: p.polygon }).flatMap((v) => [v.x, v.y]),
  })),
  hinges: geo.foldTree.hinges.map((h, i) => ({ id: h.id, parentId: h.parentId, childId: h.childId, line: [h.a.x, h.a.y, h.b.x, h.b.y], angleDeg: h.foldAngleDeg, order: h.foldOrder ?? i + 1 })),
});

const original = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
const flat = toFlat(original);
const setup = setupOf(original);
const withFlaps: FoldSetup = { ...setup, construction: { flaps: ["tuckDepth", "glueFlapWidth"] } };

/** Bounding box of the panels with one role. */
const roleBox = (geo: DielineGeometry, role: string) => {
  const pts = geo.foldTree.panels.filter((p) => p.role === role).flatMap((p) => flattenOutline({ points: p.polygon }));
  return { w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) };
};

describe("box settings of an imported dieline", () => {
  it("the fold setup built from the carton is valid and can be stretched", () => {
    expect(validateFoldSetup(setup)).toEqual([]);
    const plan = fullPlan(setup)!;
    expect(plan).not.toBeNull();
    expect(plan.natural.tuckDepth).toBeGreaterThan(0);
    expect(plan.natural.glueFlapWidth).toBeGreaterThan(0);
    // Without the flaps switched on the plan only knows the three box sizes.
    expect(planResize(setup)!.natural.tuckDepth).toBeUndefined();
  });

  it("offers dimensions, size mode, thickness and the flaps the admin marked", () => {
    const gen = createImportedGenerator("t", flat, withFlaps);
    const keys = gen.params.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["width", "baseWidth", "baseHeight", "boxHeight", "sizeMode", "thickness", "allowanceFactor", "tuckDepth", "glueFlapWidth", "bleed"]));
    const thickness = gen.params.find((p) => p.key === "thickness");
    expect(thickness).toMatchObject({ group: "Material", min: 0.05, max: 5 });
    // Every descriptor is a key the generator reads (no dead controls).
    expect(gen.params.map((p) => p.key).filter((k) => !gen.schemaKeys.includes(k))).toEqual([]);
  });

  it("guesses the names: tube cartons are tall, everything else is shallow", () => {
    const names = predictNames(planResize(setup)!);
    expect(Object.values(names).sort()).toEqual(["depth", "height", "width"]);
    const geo = createImportedGenerator("t", flat, setup).generate({});
    const p = geo.params as Record<string, number>;
    const byName = (n: string) => p[Object.entries(names).find(([, v]) => v === n)![0]]!;
    expect(byName("height")).toBeGreaterThan(byName("width"));
    expect(byName("width")).toBeGreaterThanOrEqual(byName("depth"));
  });

  it("admin names win, as long as each name is used once", () => {
    const plan = planResize(setup)!;
    const given = resolveConstruction({ names: { baseWidth: "depth", baseHeight: "width", boxHeight: "height" } }, plan).names;
    expect(given).toEqual({ baseWidth: "depth", baseHeight: "width", boxHeight: "height" });
    const dup = resolveConstruction({ names: { baseWidth: "depth", baseHeight: "depth" } }, plan).names;
    expect(dup).toEqual(predictNames(plan));
    const gen = createImportedGenerator("t", flat, { ...setup, construction: { names: { baseWidth: "depth", baseHeight: "width", boxHeight: "height" } } });
    expect(gen.params.find((p) => p.key === "baseWidth")?.label).toBe("Depth");
    expect(gen.params.find((p) => p.key === "baseHeight")?.label).toBe("Width");
  });

  it("changes only the tuck flap when the tuck depth changes", () => {
    const gen = createImportedGenerator("t", flat, withFlaps);
    const base = gen.generate({});
    const natural = (base.params as Record<string, number>).tuckDepth!;
    const more = gen.generate({ tuckDepth: natural + 10 });
    // A straight tuck carton has a tuck at the top and at the bottom: the sheet grows by 10 at each end.
    const height = (g: DielineGeometry) => g.cutBounds.max.y - g.cutBounds.min.y;
    expect(height(more) - height(base)).toBeCloseTo(20, 1);
    expect(roleBox(more, "tuck").h).toBeGreaterThan(roleBox(base, "tuck").h);
    // The walls did not move.
    expect(roleBox(more, "body")).toEqual(roleBox(base, "body"));
    expect(validateFoldSetup(setup)).toEqual([]);
  });

  it("inner mode: the inside size stays when the thickness changes, the sheet grows by allowance x thickness", () => {
    const gen = createImportedGenerator("t", flat, { ...setup, construction: { sizeMode: "inner", thickness: 0.5 } });
    const a = gen.generate({}).params as Record<string, number>;
    const b = gen.generate({ thickness: 1.5 }).params as Record<string, number>;
    const plain = createImportedGenerator("t", flat, setup).generate({}).params as Record<string, number>;
    // At the drawn thickness the inside is the drawing minus the allowance.
    expect(a.baseWidth).toBeCloseTo(plain.baseWidth! - 0.5, 1);
    // A thicker board: same inside size, bigger sheet.
    expect(b.baseWidth).toBeCloseTo(a.baseWidth!, 1);
    const sheetA = creaseSizesOf(a);
    const sheetB = creaseSizesOf(b);
    expect(sheetB.baseWidth! - sheetA.baseWidth!).toBeCloseTo(1, 1);
    const geoA = gen.generate({});
    const geoB = gen.generate({ thickness: 1.5 });
    expect(geoB.cutBounds.max.x - geoB.cutBounds.min.x).toBeGreaterThan(geoA.cutBounds.max.x - geoA.cutBounds.min.x);
  });

  it("manufacture mode: the thickness does not change the sheet", () => {
    const gen = createImportedGenerator("t", flat, setup);
    const a = gen.generate({});
    const b = gen.generate({ thickness: 3 });
    expect(b.cutBounds).toEqual(a.cutBounds);
  });

  it("typed sizes are in the chosen mode and read back as sheet sizes", () => {
    const gen = createImportedGenerator("t", flat, setup);
    const geo = gen.generate({ sizeMode: "inner", thickness: 1, allowanceFactor: 2, baseWidth: 90 });
    const sheet = creaseSizesOf(geo.params);
    expect(sheet.baseWidth).toBeCloseTo(92, 1);
  });

  it("starts at the sizes the admin set", () => {
    const natural = planResize(setup)!.natural;
    const gen = createImportedGenerator("t", flat, { ...setup, construction: { start: { baseWidth: natural.baseWidth + 5 } } });
    const p = gen.generate({}).params as Record<string, number>;
    expect(p.baseWidth).toBeCloseTo(natural.baseWidth + 5, 1);
    // The customer can still type their own.
    expect((gen.generate({ baseWidth: natural.baseWidth }).params as Record<string, number>).baseWidth).toBeCloseTo(natural.baseWidth, 1);
  });

  it("offers a flap size only when the admin switched it on", () => {
    expect(createImportedGenerator("t", flat, setup).params.some((p) => p.key === "tuckDepth")).toBe(false);
    const gen = createImportedGenerator("t", flat, { ...setup, construction: { flaps: ["tuckDepth"] } });
    expect(gen.params.some((p) => p.key === "tuckDepth")).toBe(true);
    expect(gen.params.some((p) => p.key === "glueFlapWidth")).toBe(false);
  });

  it("a flap kind that is switched off never changes how the box sizes stretch", () => {
    // Mislabelled panels (a lid called a tuck flap) must not stop the wall height from moving them.
    const wrong: FoldSetup = { ...setup, panels: setup.panels.map((p) => (p.role === "closure" ? { ...p, role: "tuck" as const } : p)) };
    const a = createImportedGenerator("t", flat, setup).generate({ boxHeight: 80 });
    const b = createImportedGenerator("t", flat, wrong).generate({ boxHeight: 80 });
    expect(b.cutBounds).toEqual(a.cutBounds);
  });

  it("rejects bad box settings when saving, and bad values when generating", () => {
    expect(validateFoldSetup({ ...setup, construction: { thickness: 0 } }).length).toBeGreaterThan(0);
    expect(validateFoldSetup({ ...setup, construction: { names: { baseWidth: "width", baseHeight: "width" } } }).length).toBeGreaterThan(0);
    const gen = createImportedGenerator("t", flat, setup);
    expect(() => gen.generate({ sizeMode: "sideways" })).toThrow(ParamValidationError);
    expect(() => gen.generate({ thickness: 99 })).toThrow(ParamValidationError);
    expect(() => createImportedGenerator("t", flat, withFlaps).generate({ tuckDepth: 100000 })).toThrow(ParamValidationError);
  });

  it("the folded box still closes after stretching (hinges stay on the panel edges)", () => {
    const gen = createImportedGenerator("t", flat, withFlaps);
    const geo = gen.generate({ baseWidth: 120, tuckDepth: 30, glueFlapWidth: 20, sizeMode: "inner", thickness: 2 });
    const world = foldTree(geo.foldTree, { progress: 1 });
    for (const p of geo.foldTree.panels) {
      for (const v of flattenOutline({ points: p.polygon })) expect(Number.isFinite(transformPoint(world.get(p.id)!, flatPoint(v)).x)).toBe(true);
    }
  });
});
