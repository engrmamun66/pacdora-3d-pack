import { describe, expect, it } from "vitest";
import { CAMERA_VIEWS, viewIconFaces } from "./camera-views";
import { viewSettingsSchema } from "./view-settings";

describe("camera views", () => {
  it("every preset is a valid view with a unique id and label", () => {
    expect(new Set(CAMERA_VIEWS.map((v) => v.id)).size).toBe(CAMERA_VIEWS.length);
    expect(new Set(CAMERA_VIEWS.map((v) => v.label)).size).toBe(CAMERA_VIEWS.length);
    for (const v of CAMERA_VIEWS) {
      expect(viewSettingsSchema.safeParse({ v: 1, azimuthDeg: v.azimuthDeg, elevationDeg: v.elevationDeg, zoom: 1, panX: 0, panY: 0, progress: 1 }).success).toBe(true);
    }
  });
  it("the icon shows one face from the front, three from a corner, and the right sides", () => {
    expect(viewIconFaces(0, 0).map((f) => f.kind)).toEqual(["front"]);
    expect(viewIconFaces(40, 38)).toHaveLength(3);
    expect(viewIconFaces(0, 89).some((f) => f.kind === "top")).toBe(true);
    expect(viewIconFaces(180, 0).every((f) => f.kind === "side")).toBe(true);
  });
});
