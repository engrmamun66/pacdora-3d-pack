import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  PRINTED_NORMAL,
  axisAngle,
  flatPoint,
  foldTree,
  generateDieline,
  multiply,
  sheetOrigin,
  transformDirection,
  transformPoint,
  translation,
  type TuckEndParams,
  type Vec3,
} from "../src";

const close = (a: Vec3, b: Vec3, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe("matrix math", () => {
  it("identity leaves points unchanged", () => {
    close(transformPoint(IDENTITY, { x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  });

  it("rotates 90 degrees about z (right-handed)", () => {
    const r = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    close(transformPoint(r, { x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  });

  it("composes translation after rotation in the right order", () => {
    const m = multiply(translation(10, 0, 0), axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2));
    close(transformPoint(m, { x: 1, y: 0, z: 0 }), { x: 10, y: 1, z: 0 });
  });

  it("directions ignore translation", () => {
    close(transformDirection(translation(5, 5, 5), { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 });
  });
});

describe("folding the tuck-end carton", () => {
  const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });
  const p = geo.params as TuckEndParams;
  const o = sheetOrigin(p);
  const tree = geo.foldTree;
  const vertexWorld = (id: string, m: Map<string, readonly number[]>) =>
    tree.panels.find((x) => x.id === id)!.polygon.map((v) => transformPoint(m.get(id)!, flatPoint(v)));

  it("progress 0 leaves every panel flat (identity)", () => {
    const flat = foldTree(tree, { progress: 0 });
    for (const panel of tree.panels) {
      for (const v of panel.polygon) close(transformPoint(flat.get(panel.id)!, flatPoint(v)), flatPoint(v));
    }
  });

  it("closed: front stays at z=0, back sits at z=depth, sides at x=0 and x=width", () => {
    const m = foldTree(tree);
    for (const v of vertexWorld("front", m)) expect(v.z).toBeCloseTo(0, 6);
    for (const v of vertexWorld("back", m)) expect(v.z).toBeCloseTo(50, 6);
    for (const v of vertexWorld("right", m)) expect(v.x).toBeCloseTo(o.x + 100, 6);
    for (const v of vertexWorld("left", m)) expect(v.x).toBeCloseTo(o.x, 6);
  });

  it("closed: top closure is the lid at the top face (y = origin.y)", () => {
    const m = foldTree(tree);
    for (const v of vertexWorld("top-closure", m)) expect(v.y).toBeCloseTo(o.y, 6);
  });

  it("closed: tuck flap hangs down inside, against the front panel", () => {
    const m = foldTree(tree);
    const tuck = vertexWorld("top-tuck", m);
    for (const v of tuck) {
      expect(v.z).toBeCloseTo(0, 6);
      expect(v.y).toBeGreaterThanOrEqual(o.y - 1e-6);
      expect(v.y).toBeLessThanOrEqual(o.y + p.tuckDepth + 1e-6);
    }
  });

  it("closed: glue flap lies in the plane of the left panel (glued inside it)", () => {
    const m = foldTree(tree);
    for (const v of vertexWorld("glue", m)) {
      expect(v.x).toBeCloseTo(o.x, 6);
      expect(v.z).toBeGreaterThanOrEqual(-1e-6);
      expect(v.z).toBeLessThanOrEqual(50 + 1e-6);
    }
  });

  it("closed: printed side of the front faces the viewer (-z)", () => {
    const m = foldTree(tree);
    close(transformDirection(m.get("front")!, PRINTED_NORMAL), { x: 0, y: 0, z: -1 });
    close(transformDirection(m.get("back")!, PRINTED_NORMAL), { x: 0, y: 0, z: 1 });
  });

  it("half-way: the right panel is at 45 degrees", () => {
    const m = foldTree(tree, { progress: 0.5 });
    const n = transformDirection(m.get("right")!, PRINTED_NORMAL);
    // Printed normal starts at -z and rotates 45 degrees toward +x.
    close(n, { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 });
  });

  it("per-hinge override keeps one flap open while the rest close", () => {
    const m = foldTree(tree, { progress: 1, hingeProgress: { "h-top-closure": 0 } });
    // Lid stays flat relative to the back panel: coplanar with the back (z = depth).
    for (const v of vertexWorld("top-closure", m)) expect(v.z).toBeCloseTo(50, 6);
  });

  it("all closed-box checks are part of normal generation", () => {
    const names = geo.checks.map((c) => c.name);
    for (const n of ["folded-box-size", "folded-seam-closes", "folded-top-closure-closes", "folded-bottom-closure-closes", "folded-print-outside"]) {
      expect(names).toContain(n);
    }
    expect(geo.checks.every((c) => c.pass)).toBe(true);
  });
});
