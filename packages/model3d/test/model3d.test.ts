import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createImportedGenerator, detectFoldSetup, generateDieline, type FlatDieline } from "@packaging/dieline-engine";
import { buildCartonModel } from "../src";

const geo = generateDieline("tuck-end-carton", { width: 100, depth: 50, height: 150 });

/** World-space bounds of `o`; updates matrices from the scene root down first. */
const worldBox = (o: THREE.Object3D) => {
  let root = o;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

describe("buildCartonModel with a ground panel", () => {
  const onFront = { ...geo, foldTree: { ...geo.foldTree, groundId: "front" } };

  it("lays the chosen panel flat on the floor, printed side down, and centres the carton", () => {
    const { object, size } = buildCartonModel(onFront, { progress: 1 });
    // The front panel (100 x 150) is the bottom now, so the carton is 50 tall.
    expect(size.x).toBeCloseTo(100, 4);
    expect(size.y).toBeCloseTo(50, 4);
    expect(size.z).toBeCloseTo(150, 4);
    const box = worldBox(object);
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(50, 4);
    expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-4);
    const front = worldBox(object.getObjectByName("front")!);
    expect(front.min.y).toBeCloseTo(-25, 4);
    expect(front.max.y).toBeCloseTo(-25, 4);
  });

  it("keeps the usual orientation when no ground panel is set", () => {
    const { size } = buildCartonModel(geo, { progress: 1 });
    expect(size.y).toBeCloseTo(150, 4);
  });
});

describe("buildCartonModel", () => {
  it("has one group per panel with outside, inside and edge objects", () => {
    const { object } = buildCartonModel(geo);
    const panels = object.children[0]!.children;
    expect(panels).toHaveLength(geo.foldTree.panels.length);
    for (const g of panels) expect(g.children).toHaveLength(3);
  });

  it("with a board thickness the dieline is the inside face, the board grows outward and folds are rounded", () => {
    const thin = buildCartonModel(geo, { progress: 1 });
    const thick = buildCartonModel(geo, { progress: 1, thickness: 2 });
    const ids = new Set(geo.foldTree.panels.map((p) => p.id));
    const panels = thick.object.children[0]!.children.filter((c) => ids.has(c.name));
    expect(panels).toHaveLength(geo.foldTree.panels.length);
    for (const g of panels) expect(g.children).toHaveLength(3); // outside, inside, edge walls (no dark outline with a real thickness)
    // Folds between the outer panels are rounded (folds of the stacked inner flaps are not).
    const strips = thick.object.children[0]!.children.filter((c) => c.name.startsWith("fold-"));
    expect(strips.length).toBeGreaterThan(0);
    expect(strips.length).toBeLessThanOrEqual(geo.foldTree.hinges.length);
    // The front panel keeps its inside face where it was and grows 2 mm outward.
    const front = (m: typeof thick) => worldBox(m.object.getObjectByName("front")!);
    expect(front(thick).min.z).toBeCloseTo(front(thin).min.z, 4);
    expect(front(thick).max.z - front(thick).min.z).toBeCloseTo(2, 4);
    // Folds turn about the inside face, so the closed box is exactly 2 x 2 mm larger each way: nothing pokes out or sinks in.
    const a = worldBox(thin.object).getSize(new THREE.Vector3());
    const b = worldBox(thick.object).getSize(new THREE.Vector3());
    expect(b.x - a.x).toBeCloseTo(4, 3);
    expect(b.y - a.y).toBeCloseTo(4, 3);
    expect(b.z - a.z).toBeCloseTo(4, 3);
    expect(thick.size.x - thin.size.x).toBeCloseTo(4, 6);
  });

  it("closed model is exactly width x height x depth, centred, y-up", () => {
    const { object, size } = buildCartonModel(geo, { progress: 1 });
    expect(size.x).toBeCloseTo(100, 6);
    expect(size.y).toBeCloseTo(150, 6);
    expect(size.z).toBeCloseTo(50, 6);
    const box = worldBox(object);
    const s = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    expect(s.x).toBeCloseTo(100, 4);
    expect(s.y).toBeCloseTo(150, 4);
    expect(s.z).toBeCloseTo(50, 4);
    expect(c.length()).toBeLessThan(1e-4);
  });

  it("puts the front panel on the +z face after the y-up rotation", () => {
    const { object } = buildCartonModel(geo);
    const front = object.getObjectByName("front")!;
    const box = worldBox(front);
    expect(box.min.z).toBeCloseTo(25, 4);
    expect(box.max.z).toBeCloseTo(25, 4);
  });

  it("puts the top closure on top (+y)", () => {
    const { object } = buildCartonModel(geo);
    const box = worldBox(object.getObjectByName("top-closure")!);
    expect(box.min.y).toBeCloseTo(75, 4);
    expect(box.max.y).toBeCloseTo(75, 4);
  });

  it("maps UVs from flat sheet coordinates", () => {
    const rect = { minX: 0, minY: 0, width: 400, height: 400 };
    const { object } = buildCartonModel(geo, { textureRect: rect, outsideTexture: new THREE.Texture() });
    const mesh = object.getObjectByName("front")!.children[0] as THREE.Mesh;
    const pos = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / 400, 6);
      expect(uv.getY(i)).toBeCloseTo(1 - pos.getY(i) / 400, 6);
    }
  });

  it("requires a texture rect when a texture is given", () => {
    expect(() => buildCartonModel(geo, { outsideTexture: new THREE.Texture() })).toThrow(/textureRect/);
  });

  it("flat model (progress 0) spans the whole sheet", () => {
    const { object } = buildCartonModel(geo, { progress: 0, layerGap: 0 });
    const s = worldBox(object).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(315, 4);
    expect(s.y).toBeCloseTo(300, 4);
    expect(s.z).toBeCloseTo(0, 4);
  });
});

describe("buildCartonModel with an imported dieline folded in stages", () => {
  const closed = (...xy: number[]) => ({ pts: xy, closed: true });
  const line = (...xy: number[]) => ({ pts: xy, closed: false });
  // Cube net of six 50 mm squares.
  const flat: FlatDieline = {
    cut: [closed(50, 0, 100, 0, 100, 50, 150, 50, 150, 100, 100, 100, 100, 200, 50, 200, 50, 100, 0, 100, 0, 50, 50, 50)],
    crease: [line(50, 50, 100, 50), line(50, 100, 100, 100), line(50, 150, 100, 150), line(50, 50, 50, 100), line(100, 50, 100, 100)],
    bleed: [],
    guide: [],
  };
  const detected = detectFoldSetup(flat).setup;
  const setup = { ...detected, hinges: detected.hinges.map((h) => ({ ...h, order: h.parentId === detected.rootId ? 1 : 2 })) };
  const cube = createImportedGenerator("cube", flat, setup).generate({});

  it("closes to a 50 mm cube", () => {
    const { size } = buildCartonModel(cube, { progress: 1, layerGap: 0 });
    for (const d of [size.x, size.y, size.z]) expect(d).toBeCloseTo(50, 6);
  });

  it("animates the second step only after the first is done", () => {
    const mid = buildCartonModel(cube, { progress: 0.5, layerGap: 0 });
    const matrixOf = (id: string) => mid.object.getObjectByName(id)!.matrix.elements;
    for (const h of cube.foldTree.hinges.filter((x) => x.foldOrder === 2)) {
      const parent = matrixOf(h.parentId);
      matrixOf(h.childId).forEach((v, i) => expect(v).toBeCloseTo(parent[i]!, 6));
    }
    const done = buildCartonModel(cube, { progress: 0.5, layerGap: 0, hingeProgress: Object.fromEntries(cube.foldTree.hinges.map((h) => [h.id, 0.5])) });
    expect(done.object.getObjectByName(cube.foldTree.hinges[0]!.childId)!.matrix.elements).not.toEqual(
      mid.object.getObjectByName(cube.foldTree.hinges[0]!.childId)!.matrix.elements,
    );
  });
});

describe("a box with a lid (extra part)", () => {
  const closed = (...xy: number[]) => ({ pts: xy, closed: true });
  const line = (...xy: number[]) => ({ pts: xy, closed: false });
  const cross = (ox: number, c: number, w: number) => {
    const x0 = ox, x1 = ox + w, x2 = ox + w + c, x3 = ox + 2 * w + c;
    const y0 = 0, y1 = w, y2 = w + c, y3 = 2 * w + c;
    return {
      cut: closed(x1, y0, x2, y0, x2, y1, x3, y1, x3, y2, x2, y2, x2, y3, x1, y3, x1, y2, x0, y2, x0, y1, x1, y1),
      crease: [line(x1, y1, x2, y1), line(x2, y1, x2, y2), line(x2, y2, x1, y2), line(x1, y2, x1, y1)],
    };
  };
  const a = cross(0, 100, 40);
  const b = cross(230, 104, 20);
  const flat: FlatDieline = { cut: [a.cut, b.cut], crease: [...a.crease, ...b.crease], bleed: [], guide: [] };
  const setup = detectFoldSetup(flat).setup;
  const make = (mode: "closed" | "open" | "beside") =>
    buildCartonModel(createImportedGenerator("t", flat, { ...setup, parts: setup.parts!.map((p) => ({ ...p, placement: { mode } })) }).generate({}));

  it("stands on its base: y is the height, 40 deep box + 20 deep lid", () => {
    const m = make("closed");
    expect(m.size.y).toBeCloseTo(60, 4);
    expect(m.size.x).toBeCloseTo(104, 4);
    const box = worldBox(m.object).getSize(new THREE.Vector3());
    expect(box.y).toBeCloseTo(60, 3);
    expect(box.x).toBeCloseTo(104, 3);
    expect(box.z).toBeCloseTo(104, 3);
  });

  it("a lid beside the box is as tall as the box only", () => {
    expect(make("beside").size.y).toBeCloseTo(40, 4);
  });

  it("an open lid is raised above the closed one", () => {
    expect(worldBox(make("open").object).max.y).toBeGreaterThan(worldBox(make("closed").object).max.y + 1);
  });
});

