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

describe("buildCartonModel", () => {
  it("has one group per panel with outside, inside and edge objects", () => {
    const { object } = buildCartonModel(geo);
    const panels = object.children[0]!.children;
    expect(panels).toHaveLength(geo.foldTree.panels.length);
    for (const g of panels) expect(g.children).toHaveLength(3);
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
