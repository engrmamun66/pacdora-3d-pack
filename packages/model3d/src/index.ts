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
  readonly outsideColor?: THREE.ColorRepresentation;
  readonly insideColor?: THREE.ColorRepresentation;
  readonly edgeColor?: THREE.ColorRepresentation;
  /**
   * Visual-only gap (mm) per layer that moves inner flaps (glue, tuck, dust,
   * lock) toward the box centre so they do not z-fight with the panel below.
   * Not part of the engineering geometry.
   */
  readonly layerGap?: number;
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
export function buildCartonModel(geo: DielineGeometry, opts: CartonModelOptions = {}): CartonModel {
  if (opts.outsideTexture && !opts.textureRect) throw new Error("textureRect is required with outsideTexture");
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
  const size = turnedBox ? turnedBox.getSize(new THREE.Vector3()) : standUp ? new THREE.Vector3(flatSize.x, flatSize.z, flatSize.y) : flatSize;
  const gap = opts.layerGap ?? 0.3;
  const rect = opts.textureRect;

  const outsideMat = new THREE.MeshStandardMaterial({
    color: opts.outsideColor ?? 0xffffff,
    map: opts.outsideTexture ?? null,
    roughness: 0.75,
    metalness: 0,
    side: THREE.BackSide, // printed side faces -z in the flat frame
  });
  const insideMat = new THREE.MeshStandardMaterial({
    color: opts.insideColor ?? 0xc8a97e,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: opts.edgeColor ?? 0x444444 });

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
    outside.castShadow = insideMesh.castShadow = true;
    outside.receiveShadow = insideMesh.receiveShadow = true;
    const edges = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline.map((v) => new THREE.Vector3(v.x, v.y, 0))),
      edgeMat,
    );

    const m = world.get(panel.id)!;
    const matrix = new THREE.Matrix4().fromArray(m as number[]);
    const layer = LAYER[panel.role] ?? 0;
    if (layer > 0 && gap > 0) {
      // Push the flap toward the box centre along its own normal.
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
      const s = Math.sign(toCentre) * gap * layer;
      matrix.premultiply(new THREE.Matrix4().makeTranslation(n.x * s, n.y * s, n.z * s));
    }

    const g = new THREE.Group();
    g.name = panel.id;
    g.matrixAutoUpdate = false;
    g.matrix.copy(matrix);
    g.add(outside, insideMesh, edges);
    inner.add(g);
  }

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
