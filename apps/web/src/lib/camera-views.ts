/** Quick camera views for the 3D box. Angles as in `ViewSettings`: azimuth 0 = looking at the front, + = from the right side; elevation 0 = level, 90 = from above. */
export interface CameraViewPreset {
  id: string;
  label: string;
  azimuthDeg: number;
  elevationDeg: number;
}

export const CAMERA_VIEWS: readonly CameraViewPreset[] = [
  { id: "front-right", label: "Front Right", azimuthDeg: 40, elevationDeg: 12 },
  { id: "front-left", label: "Front Left", azimuthDeg: -40, elevationDeg: 12 },
  { id: "top-left", label: "Top Left", azimuthDeg: -40, elevationDeg: 38 },
  { id: "top-right", label: "Top Right", azimuthDeg: 40, elevationDeg: 38 },
  { id: "front", label: "Front", azimuthDeg: 0, elevationDeg: 0 },
  { id: "top", label: "Top", azimuthDeg: 0, elevationDeg: 89 },
  { id: "left", label: "Left", azimuthDeg: -90, elevationDeg: 0 },
  { id: "right", label: "Right", azimuthDeg: 90, elevationDeg: 0 },
  { id: "back", label: "Back", azimuthDeg: 180, elevationDeg: 0 },
  { id: "bottom", label: "Bottom", azimuthDeg: 0, elevationDeg: -89 },
];

type V3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;

/** Faces of a box as corner signs; `kind` picks the shade (front = the face a view of 0 degrees looks at). */
const FACES: { kind: "front" | "top" | "side"; n: V3; pts: V3[] }[] = [
  { kind: "side", n: [1, 0, 0], pts: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
  { kind: "side", n: [-1, 0, 0], pts: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]] },
  { kind: "top", n: [0, 1, 0], pts: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { kind: "top", n: [0, -1, 0], pts: [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]] },
  { kind: "front", n: [0, 0, 1], pts: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]] },
  { kind: "side", n: [0, 0, -1], pts: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
];

/** The faces of a small box as seen from this view, as 2D polygons in a 24 x 24 icon (back faces left out, far ones first). */
export function viewIconFaces(azimuthDeg: number, elevationDeg: number): { kind: "front" | "top" | "side"; points: string }[] {
  const az = rad(azimuthDeg);
  const el = rad(elevationDeg);
  const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const right: V3 = [Math.cos(az), 0, -Math.sin(az)];
  const up: V3 = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const size: V3 = [0.62, 0.42, 0.5]; // a flat-ish box: wider than deep, low
  const scale = 8.5;
  const project = (c: V3) => {
    const v: V3 = [c[0] * size[0], c[1] * size[1], c[2] * size[2]];
    return { x: 12 + dot(v, right) * scale * 1.5, y: 12 - dot(v, up) * scale * 1.5, depth: dot(v, d) };
  };
  return FACES.filter((f) => dot(f.n, d) > 0.02)
    .map((f) => {
      const ps = f.pts.map(project);
      return { kind: f.kind, depth: ps.reduce((s, p) => s + p.depth, 0) / ps.length, points: ps.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") };
    })
    .sort((a, b) => a.depth - b.depth)
    .map(({ kind, points }) => ({ kind, points }));
}
