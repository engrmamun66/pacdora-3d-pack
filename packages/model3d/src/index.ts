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
  /** Colour of the board's cut edge (with a thickness). Default: the outside colour a little darker. */
  readonly boardEdgeColor?: THREE.ColorRepresentation;
  /** Picture of the cut edge (e.g. corrugation), repeated every `edgePitchMm` along the edge; its height is the thickness. */
  readonly boardEdgeTexture?: THREE.Texture | null;
  readonly edgePitchMm?: number;
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
 * board's inside face): a strip along the hinge with a sector cap at each end. A stacked flap (moved off its hinge to
 * clear the layer below) is joined by a strip that drifts from the hinge line to the flap's own, so it stays smooth.
 */
type Vec2Like = { readonly x: number; readonly y: number };

function addRoundedFolds(
  inner: THREE.Group,
  geo: DielineGeometry,
  world: Map<string, Mat4>,
  board: number,
  color: THREE.ColorRepresentation,
  texture: { map: THREE.Texture; rect: TextureRect } | null,
): void {
  // The rounded corner looks like the board next to it: same picture (sampled along the hinge line, so the colour runs on
  // without a seam), else the same colour.
  const mat = new THREE.MeshStandardMaterial({ color: texture ? 0xffffff : color, map: texture?.map ?? null, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  const uvAt = (x: number, y: number): [number, number] => (texture ? [(x - texture.rect.minX) / texture.rect.width, 1 - (y - texture.rect.minY) / texture.rect.height] : [0, 0]);
  const panels = new Map(geo.foldTree.panels.map((p) => [p.id, p]));
  for (const h of geo.foldTree.hinges) {
    const parent = panels.get(h.parentId);
    const child = panels.get(h.childId);
    const mP = world.get(h.parentId);
    const mC = world.get(h.childId);
    if (!parent || !child || !mP || !mC) continue;
    const vec3 = (m: Mat4, p: Vec2Like) => {
      const q = transformPoint(m, { x: p.x, y: p.y, z: 0 });
      return new THREE.Vector3(q.x, q.y, q.z);
    };
    const A = vec3(mP, h.a);
    const B = vec3(mP, h.b);
    // A stacked flap was moved off its hinge to clear the layer below: the strip drifts from the parent's hinge line to the flap's own.
    const A2 = vec3(mC, h.a).sub(A);
    const B2 = vec3(mC, h.b).sub(B);
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
    const uv: number[] = [];
    const idx: number[] = [];
    // The picture runs on around the corner: the strip samples the flat sheet from the parent's side of the hinge to the child's,
    // over the length of the curved outside (board x angle).
    const hx = h.b.x - h.a.x;
    const hy = h.b.y - h.a.y;
    const hl = Math.hypot(hx, hy) || 1;
    let nfx = -hy / hl;
    let nfy = hx / hl;
    const cc = child.polygon.reduce((acc, q) => ({ x: acc.x + q.x / child.polygon.length, y: acc.y + q.y / child.polygon.length }), { x: 0, y: 0 });
    if ((cc.x - h.a.x) * nfx + (cc.y - h.a.y) * nfy < 0) {
      nfx = -nfx;
      nfy = -nfy;
    }
    const arc = board * Math.abs(psi);
    const uvOf = (end: Vec2Like, k: number) => uvAt(end.x + nfx * (k - 0.5) * arc, end.y + nfy * (k - 0.5) * arc);
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const r = rim(k);
      const a = A.clone().addScaledVector(A2, k).add(r);
      const b = B.clone().addScaledVector(B2, k).add(r);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uv.push(...uvOf(h.a, i / steps), ...uvOf(h.b, i / steps));
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    // Sector caps: a fan from the hinge line to the rim, at each end.
    for (const [end, drift, flat] of [[A, A2, h.a], [B, B2, h.b]] as const) {
      const c = pos.length / 3;
      const mid = end.clone().addScaledVector(drift, 0.5);
      pos.push(mid.x, mid.y, mid.z);
      uv.push(...uvOf(flat, 0.5));
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const r = end.clone().addScaledVector(drift, k).add(rim(k));
        pos.push(r.x, r.y, r.z);
        uv.push(...uvOf(flat, k));
      }
      for (let i = 0; i < steps; i++) idx.push(c, c + 1 + i, c + 2 + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
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
  const edgeTexture = opts.boardEdgeTexture ?? null;
  if (edgeTexture) edgeTexture.wrapS = THREE.RepeatWrapping;
  const edgePitch = opts.edgePitchMm && opts.edgePitchMm > 0 ? opts.edgePitchMm : 8;
  const wallMat = new THREE.MeshStandardMaterial({
    color: edgeTexture ? 0xffffff : opts.boardEdgeColor ?? new THREE.Color(opts.outsideTexture ? (opts.insideColor ?? 0xc8a97e) : (opts.outsideColor ?? 0xffffff)).multiplyScalar(0.9),
    map: edgeTexture,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const inner = new THREE.Group();
  if (turn && turnedBox) {
    // Centre the turned carton: undo the turn on its bounding-box centre.
    const c = turnedBox.getCenter(new THREE.Vector3()).applyQuaternion(turn.clone().invert());
    inner.position.set(-c.x, -c.y, -c.z);
  } else {
    inner.position.set(-centre.x, -centre.y, -centre.z);
  }

  /** Where each panel finally stands (its fold, plus the shift of a stacked flap), for the rounded folds. */
  const placed = new Map<string, Mat4>();
  for (const panel of geo.foldTree.panels) {
    const outline = flattenOutline(panelOutline(panel), 0.05); // arcs as fine polylines for display
    const shape = new THREE.Shape(outline.map((v) => new THREE.Vector2(v.x, v.y)));
    // Window holes: the shape has real holes, so the box can be seen through them.
    const holes = (panel.holes ?? []).filter((h) => h.length >= 3);
    for (const h of holes) shape.holes.push(new THREE.Path(h.map((v) => new THREE.Vector2(v.x, v.y))));
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

    placed.set(panel.id, matrix.elements.slice() as Mat4);
    const g = new THREE.Group();
    g.name = panel.id;
    g.matrixAutoUpdate = false;
    g.matrix.copy(matrix);
    // With a real thickness the board's own silhouette shows the edge; the thin dark outline only belongs to paper-thin panels.
    g.add(outside, insideMesh);
    if (board === 0) g.add(edges);
    if (board > 0) {
      // Walls along the outline, from the printed face to the inside face (each edge has its own vertices: its picture runs along it).
      const wall: number[] = [];
      const wallUv: number[] = [];
      const idx: number[] = [];
      let run = 0;
      // The outline, and the edge of each hole (the board's cut edge shows there too).
      for (const loop of [outline, ...holes]) {
      run = 0;
      loop.forEach((v, i) => {
        const w = loop[(i + 1) % loop.length]!;
        const len = Math.hypot(w.x - v.x, w.y - v.y);
        const c = wall.length / 3;
        wall.push(v.x, v.y, -board, v.x, v.y, 0, w.x, w.y, -board, w.x, w.y, 0);
        wallUv.push(run / edgePitch, 0, run / edgePitch, 1, (run + len) / edgePitch, 0, (run + len) / edgePitch, 1);
        idx.push(c, c + 1, c + 2, c + 1, c + 3, c + 2);
        run += len;
      });
      }
      const wallGeom = new THREE.BufferGeometry();
      wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
      wallGeom.setAttribute("uv", new THREE.Float32BufferAttribute(wallUv, 2));
      wallGeom.setIndex(idx);
      wallGeom.computeVertexNormals();
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
      wallMesh.castShadow = wallMesh.receiveShadow = true;
      g.add(wallMesh);
    }
    inner.add(g);
  }

  if (board > 0) addRoundedFolds(inner, geo, placed, board, opts.outsideColor ?? 0xffffff, opts.outsideTexture && rect ? { map: opts.outsideTexture, rect } : null);

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
