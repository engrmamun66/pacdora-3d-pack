import { describe, expect, it } from "vitest";
import { ARRANGEMENTS, MAX_BOXES, PRESETS, presetSpec, STARTER_LAYOUTS, defaultLayoutSpec, layoutInstances, layoutSpecSchema, newBoxItem, readLayoutSpec, type LayoutSpec } from "./scene-layout";

const one = (over: Parameters<typeof newBoxItem>[0]): LayoutSpec => ({ ...defaultLayoutSpec("single"), items: [newBoxItem(over)] });

describe("layoutInstances", () => {
  it("makes one box per copy of every item", () => {
    const spec: LayoutSpec = { ...defaultLayoutSpec("single"), items: [newBoxItem({ repeat: { count: 3 } }), newBoxItem({ repeat: { count: 2 } }), newBoxItem()] };
    const list = layoutInstances(spec);
    expect(list).toHaveLength(6);
    expect(list.map((i) => i.item)).toEqual([0, 0, 0, 1, 1, 2]);
  });

  it("repeats a box a step at a time in any direction, turning each copy more", () => {
    const list = layoutInstances(one({ x: 1, yawDeg: 10, repeat: { count: 3, dx: 1.5, dy: 0.5, dz: -2, dYawDeg: 5 } }));
    expect(list.map((i) => [i.x, i.y, i.z, i.yawDeg])).toEqual([
      [1, 0, 0, 10],
      [2.5, 0.5, -2, 15],
      [4, 1, -4, 20],
    ]);
  });

  it("keeps lean and size the same for every copy", () => {
    const list = layoutInstances(one({ pitchDeg: 90, rollDeg: 4, scale: 0.8, repeat: { count: 2, dy: 1 } }));
    expect(list.every((i) => i.pitchDeg === 90 && i.rollDeg === 4 && i.scale === 0.8)).toBe(true);
  });
});

describe("arrangements", () => {
  it("makes as many boxes as asked", () => {
    for (const a of ARRANGEMENTS) {
      const n = layoutInstances(defaultLayoutSpec(a.id)).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(MAX_BOXES);
    }
    expect(layoutInstances(defaultLayoutSpec("single"))).toHaveLength(1);
    expect(layoutInstances(defaultLayoutSpec("grid"))).toHaveLength(9);
  });

  it("centres a row on the middle", () => {
    const xs = layoutInstances(defaultLayoutSpec("row")).map((i) => i.x);
    expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });

  it("stacks boxes level by level", () => {
    const list = layoutInstances(defaultLayoutSpec("stack"));
    expect(list.map((i) => i.y)).toEqual([0, 1, 2]);
    expect(list.every((i) => i.x === 0 && i.z === 0)).toBe(true);
  });

  it("lays a grid in rows and columns around the middle", () => {
    const list = layoutInstances(defaultLayoutSpec("grid"));
    expect(new Set(list.map((i) => i.x)).size).toBe(3);
    expect(new Set(list.map((i) => i.z)).size).toBe(3);
    expect(list.reduce((s, i) => s + i.x, 0)).toBeCloseTo(0);
    expect(list.reduce((s, i) => s + i.z, 0)).toBeCloseTo(0);
  });

  it("turns a fan symmetric around the middle", () => {
    expect(layoutInstances(defaultLayoutSpec("fan")).map((i) => i.yawDeg)).toEqual([-22, 0, 22]);
  });

  it("lays the flat stack on its back, with one standing box", () => {
    const list = layoutInstances(defaultLayoutSpec("flat-stack"));
    expect(list.filter((i) => i.pitchDeg === 90)).toHaveLength(3);
    expect(list.filter((i) => i.pitchDeg === 0)).toHaveLength(1);
  });
});

describe("presets and grids", () => {
  it("makes every preset a valid layout", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(20);
    for (const p of PRESETS) {
      const spec = presetSpec(p.id);
      expect(spec, p.id).not.toBeNull();
      expect(layoutSpecSchema.safeParse(spec).success, p.id).toBe(true);
    }
    expect(presetSpec("nope")).toBeNull();
  });

  it("repeats a line into rows", () => {
    const list = layoutInstances(one({ repeat: { count: 4, dx: 1, rows: 3, rowDz: 2, rowDx: 0.5 } }));
    expect(list).toHaveLength(12);
    expect(list[4]).toMatchObject({ x: 0.5, z: 2 });
    expect(list[11]).toMatchObject({ x: 4, z: 4 });
  });

  it("counts rows against the limit", () => {
    const many: LayoutSpec = { ...defaultLayoutSpec("row"), items: [newBoxItem({ repeat: { count: 12, rows: 5 } })] };
    expect(readLayoutSpec(many)).toBeNull();
  });

  it("leans neighbours opposite ways when zig-zagging, and carries the stretch", () => {
    const list = layoutInstances(one({ rollDeg: 15, stretchY: 1.5, repeat: { count: 3, dx: 1, alternateLean: true } }));
    expect(list.map((i) => i.rollDeg)).toEqual([15, -15, 15]);
    expect(list[0]!.stretch).toEqual([1, 1.5, 1]);
  });

  it("reads a second-version layout saved before rows and stretch existed", () => {
    const stored = JSON.parse(JSON.stringify(defaultLayoutSpec("row")));
    for (const it of stored.items) {
      for (const k of ["stretchX", "stretchY", "stretchZ"]) delete it[k];
      for (const k of ["dPitchDeg", "dRollDeg", "alternateLean", "rows", "rowDx", "rowDy", "rowDz"]) delete it.repeat[k];
    }
    const spec = readLayoutSpec(stored);
    expect(spec?.items[0]?.repeat.rows).toBe(1);
    expect(spec?.items[0]?.stretchX).toBe(1);
  });
});

describe("layout specs", () => {
  it("accepts every default and every starter layout", () => {
    for (const a of ARRANGEMENTS) expect(layoutSpecSchema.safeParse(defaultLayoutSpec(a.id)).success).toBe(true);
    for (const s of STARTER_LAYOUTS) expect(readLayoutSpec(s.spec)).not.toBeNull();
  });

  it("rejects damaged data and too many boxes", () => {
    expect(readLayoutSpec(null)).toBeNull();
    expect(readLayoutSpec({ ...defaultLayoutSpec("row"), items: [] })).toBeNull();
    expect(readLayoutSpec({ ...defaultLayoutSpec("row"), zoom: 99 })).toBeNull();
    const many: LayoutSpec = { ...defaultLayoutSpec("row"), items: Array.from({ length: 5 }, () => newBoxItem({ repeat: { count: 12 } })) };
    expect(readLayoutSpec(many)).toBeNull();
  });

  it("converts a stored first-version layout", () => {
    const old = { v: 1, kind: "row", count: 3, columns: 3, gap: 0.5, turnDeg: 0, tiltDeg: 0, azimuthDeg: 20, elevationDeg: 14, zoom: 1 };
    const spec = readLayoutSpec(old);
    expect(spec?.v).toBe(2);
    expect(layoutInstances(spec!).map((i) => i.x)).toEqual([-1.5, 0, 1.5]);
    expect(spec?.azimuthDeg).toBe(20);
    expect(readLayoutSpec({ ...old, kind: "spiral" })).toBeNull();
  });
});
