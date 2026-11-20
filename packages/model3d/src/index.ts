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

/** The fold step at which each panel reaches its place: the latest step among its own hinge and the hinges above it. */
function settleSteps(tree: DielineGeometry["foldTree"]): Map<string, number> {
  const byChild = new Map(tree.hinges.map((h) => [h.childId, h]));
  const out = new Map<string, number>();
  const stepOf = (id: string, seen: Set<string>): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const h = byChild.get(id);
    if (!h || seen.has(id)) return 0;
    seen.add(id);
    const v = Math.max(h.foldOrder ?? 0, stepOf(h.parentId, seen));
    out.set(id, v);
    return v;
  };
  for (const p of tree.panels) stepOf(p.id, new Set());
  return out;
}

/** True when the interior of the 2D polygon `a` and the interior of `b` share an area (checked on a grid of sample points). */
function polygonsOverlap(a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): boolean {
  const inside = (pt: { x: number; y: number }, poly: readonly { x: number; y: number }[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[i]!;
      const q = poly[j]!;
      if (p.y > pt.y !== q.y > pt.y && pt.x < ((q.x - p.x) * (pt.y - p.y)) / (q.y - p.y) + p.x) c = !c;
    }
    return c;
  };
  const xs = a.map((v) => v.x);
  const ys = a.map((v) => v.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const N = 9;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const pt = { x: x0 + ((i + 0.5) / N) * w, y: y0 + ((j + 0.5) / N) * h };
      if (inside(pt, a) && inside(pt, b)) return true;
    }
  }
  return false;
}

/**
 * Panels that end up lying on top of each other in the same plane when closed, with nothing in their roles to say which is
 * inner (they are on the same role layer, e.g. flaps that all say "tuck"), are stacked by fold step: the one folded last stays
 * outermost, the ones folded before it go one layer further in each. Returns the extra layers per panel (absent = 0).
 * Panels on different role layers (a wall and a flap) are left to their roles.
 */
function stackByFoldOrder(geo: DielineGeometry, closed: Map<string, Mat4>): Map<string, number> {
  const steps = settleSteps(geo.foldTree);
  const items = geo.foldTree.panels
    .filter((p) => closed.has(p.id))
    .map((p) => {
      const m = closed.get(p.id)!;
      return { id: p.id, layer: LAYER[p.role] ?? 0, step: steps.get(p.id) ?? 0, n: transformDirection(m, PRINTED_NORMAL), pts: p.polygon.map((v) => transformPoint(m, flatPoint(v))) };
    });
  const later = new Map<string, string[]>(); // panel -> panels in its plane that overlap it and fold after it
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.step === b.step || a.layer !== b.layer) continue;
      const dot = a.n.x * b.n.x + a.n.y * b.n.y + a.n.z * b.n.z;
      if (Math.abs(dot) < 0.999) continue;
      const p = a.pts[0]!;
      const q = b.pts[0]!;
      if (Math.abs((p.x - q.x) * a.n.x + (p.y - q.y) * a.n.y + (p.z - q.z) * a.n.z) > 0.05) continue;
      // Flatten both into the plane: two axes at right angles to the normal.
      const ref: Vec3 = Math.abs(a.n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const u = { x: a.n.y * ref.z - a.n.z * ref.y, y: a.n.z * ref.x - a.n.x * ref.z, z: a.n.x * ref.y - a.n.y * ref.x };
      const ul = Math.hypot(u.x, u.y, u.z) || 1;
      u.x /= ul; u.y /= ul; u.z /= ul;
      const v = { x: a.n.y * u.z - a.n.z * u.y, y: a.n.z * u.x - a.n.x * u.z, z: a.n.x * u.y - a.n.y * u.x };
      const flat = (pts: readonly Vec3[]) => pts.map((t) => ({ x: t.x * u.x + t.y * u.y + t.z * u.z, y: t.x * v.x + t.y * v.y + t.z * v.z }));
      if (!polygonsOverlap(flat(a.pts), flat(b.pts))) continue;
      const [first, last] = a.step < b.step ? [a, b] : [b, a];
      later.set(first.id, [...(later.get(first.id) ?? []), last.id]);
    }
  }
  const level = new Map<string, number>();
  const levelOf = (id: string): number => {
    const known = level.get(id);
    if (known !== undefined) return known;
    const over = later.get(id) ?? [];
    const v = over.length ? 1 + Math.max(...over.map(levelOf)) : 0;
    level.set(id, v);
    return v;
  };
  for (const it of items) levelOf(it.id);
  return new Map([...level].filter(([, v]) => v > 0));
}

function foldedBounds(geo: DielineGeometry, world: Map<string, Mat4>, turn?: THREE.Quaternion, only?: ReadonlySet<string>) {
  const box = new THREE.Box3();
  for (const p of geo.foldTree.panels) {
    if (only && !only.has(p.id)) continue;
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

/** The panels of the main body: every panel reachable from the root without going into an extra part. */
function mainBodyPanels(tree: DielineGeometry["foldTree"]): Set<string> {
  const partRoots = new Set((tree.parts ?? []).map((q) => q.rootId));
  const main = new Set<string>([tree.rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const h of tree.hinges) {
      if (main.has(h.parentId) && !main.has(h.childId) && !partRoots.has(h.childId)) {
        main.add(h.childId);
        grew = true;
      }
    }
  }
  return main;
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
  const closedTurn = groundTurn(geo, closedWorld);
  const turnedBox = closedTurn ? foldedBounds(geo, closedWorld, closedTurn) : null;
  // The ground panel is what lies on the floor at every fold amount, so the turn follows where it is NOW. When it is the
  // base nothing changes; when it is another panel the flat sheet still lies on the floor (it is not hung from the closed box).
  const turn = closedTurn ? groundTurn(geo, world) ?? closedTurn : null;
  const standUp = !turn && (geo.foldTree.parts?.length ?? 0) > 0;
  const sizeFlat = turnedBox ? turnedBox.getSize(new THREE.Vector3()) : standUp ? new THREE.Vector3(flatSize.x, flatSize.z, flatSize.y) : flatSize;
  const board = Number.isFinite(opts.thickness) && (opts.thickness as number) > 0 ? (opts.thickness as number) : 0;
  const layerGap = opts.layerGap ?? 0.3;
  const stacked = stackByFoldOrder(geo, closedWorld);
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
  if (turn && closedTurn && turnedBox) {
    // Centre the turned carton on the closed box, with the ground panel held where it sits in the closed box.
    const anchor = (w: Map<string, Mat4>, q: THREE.Quaternion) => {
      const id = geo.foldTree.groundId;
      const panel = geo.foldTree.panels.find((x) => x.id === id);
      const m = id ? w.get(id) : undefined;
      if (!panel || !m) return null;
      const pts = panel.polygon.map((v) => transformPoint(m, flatPoint(v)));
      const mean = pts.reduce<THREE.Vector3>((a, t) => a.add(new THREE.Vector3(t.x, t.y, t.z)), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
      return mean.applyQuaternion(q);
    };
    const now = anchor(world, turn);
    const closed = anchor(closedWorld, closedTurn);
    const want = closed ? closed.sub(turnedBox.getCenter(new THREE.Vector3())) : turnedBox.getCenter(new THREE.Vector3()).negate();
    const offset = now ? want.sub(now) : turnedBox.getCenter(new THREE.Vector3()).negate();
    const c = offset.applyQuaternion(turn.clone().invert());
    inner.position.set(c.x, c.y, c.z);
  } else {
    // With extra parts (a lid) the MAIN BODY sits at the middle of the grid, at every fold amount, not the middle of the body and the parts together.
    // Height stays with the whole box; the viewer rests the model on the floor itself.
    let at = centre;
    if ((geo.foldTree.parts?.length ?? 0) > 0) {
      const mainBox = foldedBounds(geo, closedWorld, undefined, mainBodyPanels(geo.foldTree));
      if (!mainBox.isEmpty()) {
        const mc = mainBox.getCenter(new THREE.Vector3());
        at = new THREE.Vector3(mc.x, mc.y, centre.z);
      }
    }
    inner.position.set(-at.x, -at.y, -at.z);
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
    const layer = (LAYER[panel.role] ?? 0) + (stacked.get(panel.id) ?? 0);
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
  // The turn the model was built with, so a viewer that re-aims the object (a layout) can keep it standing the right way up.
  object.userData.stand = object.quaternion.clone();
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
