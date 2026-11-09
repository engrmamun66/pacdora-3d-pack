import { z } from "zod";

/**
 * The starting 3D view of a template: where the camera is and how far the box is folded.
 * Everything is relative to the box size, so one view works for any dimensions.
 *
 *   azimuthDeg    turn around the box (0 = looking at the front, + turns to the right side)
 *   elevationDeg  tilt (0 = level with the box, 90 = from above)
 *   zoom          1 = the standard distance; 2 = twice as close
 *   panX, panY    sideways / up-down shift of the view, in box sizes
 *   progress      fold amount (0 = flat, 1 = closed)
 */
export const viewSettingsSchema = z.object({
  v: z.literal(1),
  azimuthDeg: z.number().finite().min(-180).max(180),
  elevationDeg: z.number().finite().min(-89).max(89),
  zoom: z.number().finite().min(0.2).max(10),
  panX: z.number().finite().min(-3).max(3),
  panY: z.number().finite().min(-3).max(3),
  progress: z.number().finite().min(0).max(1),
});
export type ViewSettings = z.infer<typeof viewSettingsSchema>;

/** The standard view (close to the one the viewer always used). */
export const STANDARD_VIEW: ViewSettings = { v: 1, azimuthDeg: 36, elevationDeg: 25, zoom: 1, panX: 0, panY: 0, progress: 1 };

/** Camera distance (in box sizes) at zoom 1. */
const BASE_DISTANCE = 3;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Axes for a camera turned by `az` and tilted by `el`: d points from the target to the camera. */
function axes(azimuthDeg: number, elevationDeg: number) {
  const az = rad(azimuthDeg);
  const el = rad(elevationDeg);
  const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const right: V3 = [Math.cos(az), 0, -Math.sin(az)];
  const up = cross(d, right);
  return { d, right, up };
}

/**
 * Camera position and look-at point for a view. `base` is the centre the box is
 * framed around (its middle), `size` the reference size of the box in the same unit.
 */
export function viewToCamera(view: ViewSettings, base: V3, size: number): { position: V3; target: V3 } {
  const { d, right, up } = axes(view.azimuthDeg, view.elevationDeg);
  const target: V3 = [
    base[0] + (right[0] * view.panX + up[0] * view.panY) * size,
    base[1] + (right[1] * view.panX + up[1] * view.panY) * size,
    base[2] + (right[2] * view.panX + up[2] * view.panY) * size,
  ];
  const dist = (BASE_DISTANCE * size) / view.zoom;
  return { position: [target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist], target };
}

/** The reverse of `viewToCamera`: describe where the camera is now. */
export function cameraToView(position: V3, target: V3, base: V3, size: number, progress: number): ViewSettings {
  const off: V3 = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
  const dist = Math.hypot(...off) || 1e-9;
  const elevationDeg = deg(Math.asin(Math.max(-1, Math.min(1, off[1] / dist))));
  const azimuthDeg = Math.abs(off[0]) + Math.abs(off[2]) < 1e-9 ? 0 : deg(Math.atan2(off[0], off[2]));
  const { right, up } = axes(azimuthDeg, elevationDeg);
  const delta: V3 = [target[0] - base[0], target[1] - base[1], target[2] - base[2]];
  const round = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;
  return {
    v: 1,
    azimuthDeg: round(azimuthDeg, 2),
    elevationDeg: round(Math.max(-89, Math.min(89, elevationDeg)), 2),
    zoom: round(Math.max(0.2, Math.min(10, (BASE_DISTANCE * size) / dist)), 3),
    panX: round(dot(delta, right) / size, 4),
    panY: round(dot(delta, up) / size, 4),
    progress: round(Math.max(0, Math.min(1, progress)), 3),
  };
}

/** A stored value that may be missing or damaged: the view, or null. */
export function readViewSettings(raw: unknown): ViewSettings | null {
  const p = viewSettingsSchema.safeParse(raw);
  return p.success ? p.data : null;
}
