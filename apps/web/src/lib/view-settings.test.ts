import { describe, expect, it } from "vitest";
import { STANDARD_VIEW, cameraToView, readViewSettings, viewSettingsSchema, viewToCamera } from "./view-settings";

describe("view settings", () => {
  const base: [number, number, number] = [0, 50, 0];

  it("round-trips camera <-> view for any box size", () => {
    for (const size of [30, 120, 900]) {
      for (const v of [
        STANDARD_VIEW,
        { ...STANDARD_VIEW, azimuthDeg: -120, elevationDeg: 60, zoom: 2.5, panX: 0.2, panY: -0.15, progress: 0.4 },
        { ...STANDARD_VIEW, azimuthDeg: 179, elevationDeg: -30, zoom: 0.5, panX: -1, panY: 1, progress: 0 },
      ]) {
        const { position, target } = viewToCamera(v, base, size);
        const back = cameraToView(position, target, base, size, v.progress);
        expect(back.azimuthDeg).toBeCloseTo(v.azimuthDeg, 1);
        expect(back.elevationDeg).toBeCloseTo(v.elevationDeg, 1);
        expect(back.zoom).toBeCloseTo(v.zoom, 2);
        expect(back.panX).toBeCloseTo(v.panX, 3);
        expect(back.panY).toBeCloseTo(v.panY, 3);
      }
    }
  });

  it("zoom 2 is half the distance; turning right moves the camera to +x", () => {
    const a = viewToCamera({ ...STANDARD_VIEW, zoom: 1, azimuthDeg: 0, elevationDeg: 0 }, base, 100);
    const b = viewToCamera({ ...STANDARD_VIEW, zoom: 2, azimuthDeg: 0, elevationDeg: 0 }, base, 100);
    expect(Math.abs(a.position[2] - a.target[2])).toBeCloseTo(300, 6);
    expect(Math.abs(b.position[2] - b.target[2])).toBeCloseTo(150, 6);
    expect(viewToCamera({ ...STANDARD_VIEW, azimuthDeg: 90, elevationDeg: 0 }, base, 100).position[0]).toBeGreaterThan(0);
  });

  it("pan moves the look-at point sideways in the screen plane", () => {
    const c = viewToCamera({ ...STANDARD_VIEW, azimuthDeg: 0, elevationDeg: 0, panX: 0.5, panY: 0.25 }, base, 100);
    expect(c.target[0]).toBeCloseTo(50, 6);
    expect(c.target[1]).toBeCloseTo(75, 6);
    expect(c.target[2]).toBeCloseTo(0, 6);
  });

  it("validates stored values", () => {
    expect(viewSettingsSchema.safeParse(STANDARD_VIEW).success).toBe(true);
    expect(readViewSettings({ ...STANDARD_VIEW, zoom: 0 })).toBeNull();
    expect(readViewSettings({ ...STANDARD_VIEW, elevationDeg: 90 })).toBeNull();
    expect(readViewSettings(null)).toBeNull();
    expect(readViewSettings("x")).toBeNull();
  });
});
