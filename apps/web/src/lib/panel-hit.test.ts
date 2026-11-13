import { describe, expect, it } from "vitest";
import { panelAt, type PanelShape } from "./panel-hit";

const rect = (id: string, x: number, y: number, w: number, h: number): PanelShape => ({ id, poly: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });

describe("panelAt", () => {
  const shapes = [rect("base", 0, 0, 100, 60), rect("flap", 10, 10, 20, 20), rect("side", 100, 0, 30, 60)];
  it("finds the panel under the point, the smallest when they overlap, or null", () => {
    expect(panelAt(shapes, { x: 50, y: 50 })?.id).toBe("base");
    expect(panelAt(shapes, { x: 15, y: 15 })?.id).toBe("flap");
    expect(panelAt(shapes, { x: 115, y: 30 })?.id).toBe("side");
    expect(panelAt(shapes, { x: 200, y: 30 })).toBeNull();
  });
});
