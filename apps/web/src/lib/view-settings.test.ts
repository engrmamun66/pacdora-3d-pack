import { describe, expect, it } from "vitest";
import { STANDARD_VIEW, cameraToView, readViewSettings, viewSettingsSchema, viewToCamera } from "./view-settings";

describe("view settings", () => {
  const base: [number, number, number] = [0, 50, 0];

  it("round-trips camera <-> view for any box size", () => {
    for (const size of [30, 120, 900]) {
      for (const v of [
        STANDARD_VIEW,
        { ...STANDARD_VIEW, azimuthDeg: -120, elevationDeg: 60, zoom: 2.5, panX: 0.2, panY: -0.15, panZ: 0.3, progress: 0.4 },
        { ...STANDARD_VIEW, azimuthDeg: 179, elevationDeg: -30, zoom: 0.5, panX: -1, panY: 1, panZ: -0.5, progress: 0 },
      ]) {
        const { position, target } = viewToCamera(v, base, size);
        const back = cameraToView(position, target, base, size, v.progress);
        expect(back.azimuthDeg).toBeCloseTo(v.azimuthDeg, 1);
        expect(back.elevationDeg).toBeCloseTo(v.elevationDeg, 1);
        expect(back.zoom).toBeCloseTo(v.zoom, 2);
        expect(back.panX).toBeCloseTo(v.panX, 3);
        expect(back.panY).toBeCloseTo(v.panY, 3);
      expect(back.panZ).toBeCloseTo(v.panZ, 3);
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

  it("roll: old saved views read as upright, and a rolled view round-trips with screen-aligned panning", () => {
    const old: Record<string, unknown> = { ...STANDARD_VIEW };
    delete old.rollDeg;
    expect(readViewSettings(old)?.rollDeg).toBe(0);
    expect(readViewSettings({ ...STANDARD_VIEW, rollDeg: 181 })).toBeNull();
    for (const v of [
      { ...STANDARD_VIEW, rollDeg: 40, panX: 0.3, panY: -0.2 },
      { ...STANDARD_VIEW, azimuthDeg: -100, elevationDeg: 50, rollDeg: -135, zoom: 1.7, panX: -0.4, panY: 0.6, panZ: 0.8 },
    ]) {
      const { position, target } = viewToCamera(v, base, 100);
      const back = cameraToView(position, target, base, 100, v.progress, v.rollDeg);
      expect(back.rollDeg).toBeCloseTo(v.rollDeg, 1);
      expect(back.panX).toBeCloseTo(v.panX, 3);
      expect(back.panY).toBeCloseTo(v.panY, 3);
      expect(back.panZ).toBeCloseTo(v.panZ, 3);
    }
    // looking at the front, rolled a quarter turn: "screen right" is the box's up (or down) direction
    const c = viewToCamera({ ...STANDARD_VIEW, azimuthDeg: 0, elevationDeg: 0, rollDeg: 90, panX: 0.5, panY: 0 }, base, 100);
    expect(Math.abs(c.target[0])).toBeCloseTo(0, 6);
    expect(Math.abs(c.target[1] - 50)).toBeCloseTo(50, 6);
  });
});

describe("depth shift (panZ)", () => {
  it("moves the box toward the camera when positive, and an old view reads as 0", () => {
    const base: [number, number, number] = [0, 0, 0];
    const flat = viewToCamera({ ...STANDARD_VIEW, azimuthDeg: 0, elevationDeg: 0 }, base, 100);
    const near = viewToCamera({ ...STANDARD_VIEW, azimuthDeg: 0, elevationDeg: 0, panZ: 0.5 }, base, 100);
    expect(Math.hypot(near.position[0] - base[0], near.position[1] - base[1], near.position[2] - base[2])).toBeLessThan(Math.hypot(...flat.position));
    expect(near.target[2]).toBeCloseTo(-50, 5);
    expect(readViewSettings({ v: 1, azimuthDeg: 10, elevationDeg: 20, zoom: 1, panX: 0, panY: 0, progress: 1 })?.panZ).toBe(0);
  });
});
