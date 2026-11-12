import * as THREE from "three";
import {
  type DielineGeometry,
  type FoldOptions,
  type Mat4,
  type Vec3,
  PRINTED_NORMAL,
  flatPoint,
  flattenOutline,
  panelOutline,
  foldTree,
  transformDirection,
  transformPoint,
} from "@packaging/dieline-engine";

/** Region of the flat sheet (mm) that the outside texture image covers. */
export interface TextureRect {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface CartonModelOptions extends FoldOptions {
  /** Artwork for the printed (outside) side, laid out in flat dieline space. */
  readonly outsideTexture?: THREE.Texture | null;
  /** Required when `outsideTexture` is given. */
  readonly textureRect?: TextureRect;
  /** Picture for the inside face, laid out in flat dieline space over `textureRect` (also needs `textureRect`). */
  readonly insideTexture?: THREE.Texture | null;
  readonly outsideColor?: THREE.ColorRepresentation;
  readonly insideColor?: THREE.ColorRepresentation;
  readonly edgeColor?: THREE.ColorRepresentation;
  /**
   * Visual-only gap (mm) per layer that moves inner flaps (glue, tuck, dust,
   * lock) toward the box centre so they do not z-fight with the panel below.
   * Not part of the engineering geometry.
   */
  readonly layerGap?: number;
  /**
   * Board thickness (mm). The flat dieline is the INSIDE face of the board (folds turn about it, as real board
   * does); the board grows from it toward the printed side, with edge walls, and every fold gets a rounded
   * outside corner of radius = thickness. Flaps are stacked clear of it. Default 0 = paper-thin panels.
   * Visual only: the engineering geometry stays zero-thickness.
   */
  readonly thickness?: number;
}

export interface CartonModel {
  /** Root object, y-up, centred on the closed carton. Add this to a scene. */
  readonly object: THREE.Group;
  /** Closed carton size in mm (x, y, z after the y-up rotation). */
  readonly size: THREE.Vector3;
}

/** Visual stacking layer per role: 0 = outer skin, higher = further inside. */
const LAYER: Readonly<Partial<Record<string, number>>> = {
  "glue-flap": 1,
  tuck: 1,
  "dust-flap": 1,
  // Crash-lock bottom: outer flap (0) < glue tab (1) < lock flap (2).
  "lock-flap": 2,
};

function foldedBounds(geo: DielineGeometry, world: Map<string, Mat4>, turn?: THREE.Quaternion) {
  const box = new THREE.Box3();
  for (const p of geo.foldTree.panels) {
    for (const v of flattenOutline(panelOutline(p))) {
      const q = transformPoint(world.get(p.id)!, flatPoint(v));
      const point = new THREE.Vector3(q.x, q.y, q.z);
      box.expandByPoint(turn ? point.applyQuaternion(turn) : point);
    }
  }
  return box;
}

/**
 * Turn that puts the chosen ground panel flat on the floor, printed side down, starting from the
 * usual "flat frame is y-down" flip so the front keeps facing the viewer. Null if no ground panel is set.
 */
function groundTurn(geo: DielineGeometry, closed: Map<string, Mat4>): THREE.Quaternion | null {
  const id = geo.foldTree.groundId;
  const m = id ? closed.get(id) : undefined;
  if (!m) return null;
  const n = transformDirection(m, PRINTED_NORMAL);
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const down = new THREE.Vector3(n.x, n.y, n.z).normalize().applyQuaternion(flip);
  return new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, -1, 0)).multiply(flip);
}

/**
 * Build a three.js model of the carton from validated dieline geometry.
 * Every panel is a flat polygon placed by the engine's fold transforms; UVs are
 * the panel's own flat-sheet coordinates, so artwork drawn on the 2D dieline
 * appears on exactly the same panel in 3D.
 */
/**
 * The outside of every fold is a rounded corner of radius `board`, centred on the hinge line (which lies on the
 * board's inside face): a strip along the hinge with a sector cap at each end. Folds of flaps that are stacked
 * (they are moved off their hinge) get none.
 */
function addRoundedFolds(inner: THREE.Group, geo: DielineGeometry, world: Map<string, Mat4>, board: number, color: THREE.ColorRepresentation): void {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const panels = new Map(geo.foldTree.panels.map((p) => [p.id, p]));
  for (const h of geo.foldTree.hinges) {
    const parent = panels.get(h.parentId);
    const child = panels.get(h.childId);
    const mP = world.get(h.parentId);
    const mC = world.get(h.childId);
    if (!parent || !child || !mP || !mC) continue;
    if ((LAYER[parent.role] ?? 0) > 0 || (LAYER[child.role] ?? 0) > 0) continue;
    const A = new THREE.Vector3(...Object.values(transformPoint(mP, flatPoint(h.a))) as [number, number, number]);
    const B = new THREE.Vector3(...Object.values(transformPoint(mP, flatPoint(h.b))) as [number, number, number]);
    const axis = B.clone().sub(A);
    if (axis.length() < 1e-9) continue;
    axis.normalize();
    const nP = new THREE.Vector3(...(Object.values(transformDirection(mP, PRINTED_NORMAL)) as [number, number, number]));
    const nC = new THREE.Vector3(...(Object.values(transformDirection(mC, PRINTED_NORMAL)) as [number, number, number]));
    let psi = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(nP, nC)), nP.dot(nC));
    if (Math.abs(psi) > Math.PI - 1e-4) {
      // A full fold back: which way it turned follows the side of the hinge the child lies on.
      const dx = h.b.x - h.a.x;
      const dy = h.b.y - h.a.y;
      const cx = child.polygon.reduce((a, q) => a + q.x, 0) / child.polygon.length - h.a.x;
      const cy = child.polygon.reduce((a, q) => a + q.y, 0) / child.polygon.length - h.a.y;
      psi = Math.sign(dx * cy - dy * cx) * Math.sign(h.foldAngleDeg || 1) * Math.PI;
    }
    if (Math.abs(psi) < 0.02) continue;
    const steps = Math.max(2, Math.ceil(Math.abs(psi) / (Math.PI / 16)));
    const around = new THREE.Vector3().crossVectors(axis, nP);
    const rim = (k: number) => nP.clone().multiplyScalar(Math.cos(psi * k)).addScaledVector(around, Math.sin(psi * k)).multiplyScalar(board);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const r = rim(i / steps);
      const a = A.clone().add(r);
      const b = B.clone().add(r);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    // Sector caps: a fan from the hinge line to the rim, at each end.
    for (const end of [A, B]) {
      const c = pos.length / 3;
      pos.push(end.x, end.y, end.z);
      for (let i = 0; i <= steps; i++) {
        const r = end.clone().add(rim(i / steps));
        pos.push(r.x, r.y, r.z);
      }
      for (let i = 0; i < steps; i++) idx.push(c, c + 1 + i, c + 2 + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `fold-${h.id}`;
    inner.add(mesh);
  }
}

export function buildCartonModel(geo: DielineGeometry, opts: CartonModelOptions = {}): CartonModel {
  if ((opts.outsideTexture || opts.insideTexture) && !opts.textureRect) throw new Error("textureRect is required with outsideTexture or insideTexture");
  const world = foldTree(geo.foldTree, opts);
  // Centre on the CLOSED carton so the model does not jump while animating.
  const closedWorld = foldTree(geo.foldTree, { progress: 1 });
  const closedBox = foldedBounds(geo, closedWorld);
  const centre = closedBox.getCenter(new THREE.Vector3());
  const flatSize = closedBox.getSize(new THREE.Vector3());
  // A chosen ground panel decides which way is down. Otherwise, with extra parts (a lid on a box) the
  // parts are stacked along the sheet's normal, so that is "up": the model stands on its base.
  // Without parts the sheet's own y axis is up, as always.
  const turn = groundTurn(geo, closedWorld);
  const turnedBox = turn ? foldedBounds(geo, closedWorld, turn) : null;
  const standUp = !turn && (geo.foldTree.parts?.length ?? 0) > 0;
  const sizeFlat = turnedBox ? turnedBox.getSize(new THREE.Vector3()) : standUp ? new THREE.Vector3(flatSize.x, flatSize.z, flatSize.y) : flatSize;
  const board = Number.isFinite(opts.thickness) && (opts.thickness as number) > 0 ? (opts.thickness as number) : 0;
  const layerGap = opts.layerGap ?? 0.3;
  // The board sits outside the dieline's (inside-face) plane on every side.
  const size = sizeFlat.clone().addScalar(2 * board);
  const rect = opts.textureRect;

  const outsideMat = new THREE.MeshStandardMaterial({
    color: opts.outsideColor ?? 0xffffff,
    map: opts.outsideTexture ?? null,
    roughness: 0.75,
    metalness: 0,
    side: THREE.BackSide, // printed side faces -z in the flat frame
  });
  const insideMat = new THREE.MeshStandardMaterial({
    color: opts.insideTexture ? 0xffffff : (opts.insideColor ?? 0xc8a97e),
    map: opts.insideTexture ?? null,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: opts.edgeColor ?? 0x444444 });
  // The cut edge of the board (only with a thickness).
  const wallMat = new THREE.MeshStandardMaterial({ color: opts.insideColor ?? 0xc8a97e, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });

  const inner = new THREE.Group();
  if (turn && turnedBox) {
    // Centre the turned carton: undo the turn on its bounding-box centre.
    const c = turnedBox.getCenter(new THREE.Vector3()).applyQuaternion(turn.clone().invert());
    inner.position.set(-c.x, -c.y, -c.z);
  } else {
    inner.position.set(-centre.x, -centre.y, -centre.z);
  }

  for (const panel of geo.foldTree.panels) {
    const outline = flattenOutline(panelOutline(panel), 0.05); // arcs as fine polylines for display
    const shape = new THREE.Shape(outline.map((v) => new THREE.Vector2(v.x, v.y)));
    const geom = new THREE.ShapeGeometry(shape);
    const pos = geom.getAttribute("position");
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      uv[i * 2] = rect ? (x - rect.minX) / rect.width : 0;
      uv[i * 2 + 1] = rect ? 1 - (y - rect.minY) / rect.height : 0; // image rows go down, v goes up
    }
    geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    const outside = new THREE.Mesh(geom, outsideMat);
    const insideMesh = new THREE.Mesh(geom, insideMat);
    // With a thickness the dieline is the inside face; the printed face sits one board thickness outside it.
    if (board > 0) outside.position.z = -board;
    outside.castShadow = insideMesh.castShadow = true;
    outside.receiveShadow = insideMesh.receiveShadow = true;
    const edges = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline.map((v) => new THREE.Vector3(v.x, v.y, 0))),
      edgeMat,
    );

    const m = world.get(panel.id)!;
    const matrix = new THREE.Matrix4().fromArray(m as number[]);
    const layer = LAYER[panel.role] ?? 0;
    if (layer > 0 && layerGap + board > 0) {
      // Push the flap toward the box centre along its own normal, so it stacks on the layer below.
      const n: Vec3 = transformDirection(m, PRINTED_NORMAL);
      const c = panel.polygon.reduce<Vec3>(
        (acc, v) => {
          const q = transformPoint(m, flatPoint(v));
          const k = panel.polygon.length;
          return { x: acc.x + q.x / k, y: acc.y + q.y / k, z: acc.z + q.z / k };
        },
        { x: 0, y: 0, z: 0 },
      );
      const toCentre = (centre.x - c.x) * n.x + (centre.y - c.y) * n.y + (centre.z - c.z) * n.z;
      const toward = Math.sign(toCentre);
      // Distance of the flap's board from the layer below: a small gap per layer plus the boards between.
      const d = layerGap * layer + board * (layer - 1);
      // The board grows from the flap's plane toward the printed normal. Facing the centre, it grows toward the
      // centre already; facing away, it grows toward the wall, so the plane moves one thickness further in.
      const s = toward * (d + (toward < 0 ? board : 0));
      matrix.premultiply(new THREE.Matrix4().makeTranslation(n.x * s, n.y * s, n.z * s));
    }

    const g = new THREE.Group();
    g.name = panel.id;
    g.matrixAutoUpdate = false;
    g.matrix.copy(matrix);
    g.add(outside, insideMesh, edges);
    if (board > 0) {
      // Walls along the outline, from the printed face to the inside face.
      const wall: number[] = [];
      const idx: number[] = [];
      outline.forEach((v, i) => {
        wall.push(v.x, v.y, -board, v.x, v.y, 0);
        const a = i * 2;
        const b = ((i + 1) % outline.length) * 2;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      });
      const wallGeom = new THREE.BufferGeometry();
      wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
      wallGeom.setIndex(idx);
      wallGeom.computeVertexNormals();
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
      wallMesh.castShadow = wallMesh.receiveShadow = true;
      g.add(wallMesh);
    }
    inner.add(g);
  }

  if (board > 0) addRoundedFolds(inner, geo, world, board, opts.outsideTexture ? (opts.insideColor ?? 0xc8a97e) : (opts.outsideColor ?? 0xffffff));

  const object = new THREE.Group();
  object.name = "carton";
  // Flat frame is y-down. Make it y-up with the print facing +z, or (with parts) stand it on its base.
  if (turn) object.quaternion.copy(turn);
  else object.rotation.x = standUp ? -Math.PI / 2 : Math.PI;
  object.add(inner);
  return { object, size };
}

/** Free GPU resources of a model built by buildCartonModel. */
export function disposeCartonModel(model: CartonModel): void {
  const materials = new Set<THREE.Material>();
  model.object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      const m = o.material;
      (Array.isArray(m) ? m : [m]).forEach((x) => materials.add(x));
    }
  });
  materials.forEach((m) => m.dispose());
}
