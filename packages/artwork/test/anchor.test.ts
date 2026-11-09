import { describe, expect, it } from "vitest";
import { generateDieline, outlineBounds, panelOutline } from "@packaging/dieline-engine";
import { artworkSchema, type ArtworkObject } from "@packaging/schema";
import { anchorFor, anchorIndex, backgroundPlacement, objectCentre, orphanedObjects, panelAt, pointInPolygon } from "../src";

const geo = (dims: { width: number; depth: number; height: number }) => generateDieline("tuck-end-carton", dims);

const rect = (over: Partial<ArtworkObject> = {}): ArtworkObject =>
  ({
    id: "r1",
    name: "Rect",
    type: "rect",
    panelId: "front",
    dx: 0,
    dy: 0,
    angle: 0,
    opacity: 1,
    visible: true,
    locked: false,
    width: 20,
    height: 10,
    fill: "#ff0000",
    stroke: null,
    strokeWidth: 0,
    cornerRadius: 0,
    ...over,
  }) as ArtworkObject;

describe("artwork anchoring", () => {
  const g = geo({ width: 100, depth: 50, height: 150 });
  const idx = anchorIndex(g);

  it("panel anchor is the panel's bounding-box centre", () => {
    const b = outlineBounds(panelOutline(g.foldTree.panels.find((p) => p.id === "front")!));
    const c = objectCentre(idx, { panelId: "front", dx: 0, dy: 0 });
    expect(c.x).toBeCloseTo((b.min.x + b.max.x) / 2, 9);
    expect(c.y).toBeCloseTo((b.min.y + b.max.y) / 2, 9);
  });

  it("finds the panel under a point and round-trips the anchor", () => {
    const centre = objectCentre(idx, { panelId: "back", dx: 12, dy: -30 });
    expect(panelAt(idx, centre)).toBe("back");
    const a = anchorFor(idx, centre);
    expect(a.panelId).toBe("back");
    expect(a.dx).toBeCloseTo(12, 9);
    expect(a.dy).toBeCloseTo(-30, 9);
  });

  it("a point off the sheet anchors to the sheet centre", () => {
    const a = anchorFor(idx, { x: -500, y: -500 });
    expect(a.panelId).toBeNull();
    const c = objectCentre(idx, a);
    expect(c.x).toBeCloseTo(-500, 9);
    expect(c.y).toBeCloseTo(-500, 9);
  });

  it("artwork follows its panel when the box dimensions change", () => {
    const bigger = anchorIndex(geo({ width: 140, depth: 70, height: 180 }));
    const o = { panelId: "back", dx: 5, dy: 5 };
    const before = objectCentre(idx, o);
    const after = objectCentre(bigger, o);
    // The back panel moved right by (40 + 20) and down with the taller top flaps;
    // the object stays at the same offset from the panel centre.
    expect(panelAt(bigger, after)).toBe("back");
    expect(after.x - before.x).toBeGreaterThan(50);
    const centre = bigger.panels.get("back")!.centre;
    expect(after.x - centre.x).toBeCloseTo(5, 9);
    expect(after.y - centre.y).toBeCloseTo(5, 9);
  });

  it("reports objects whose panel disappeared and places them on the sheet", () => {
    const crash = anchorIndex(generateDieline("crash-lock-carton", { width: 100, depth: 50, height: 150 }));
    const art = { objects: [rect({ id: "a", panelId: "front" }), rect({ id: "b", panelId: "bottom-tuck" })] };
    expect(orphanedObjects(crash, art).map((o) => o.id)).toEqual(["b"]);
    const c = objectCentre(crash, { panelId: "bottom-tuck", dx: 1, dy: 2 });
    expect(c.x).toBeCloseTo(crash.sheet.x + 1, 9);
  });

  it("pointInPolygon on a square", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe("artwork schema", () => {
  it("accepts every object type", () => {
    const objects = [
      rect(),
      { ...rect({ id: "e" }), type: "ellipse" },
      { id: "t", name: "T", type: "text", panelId: null, dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false, text: "Hi", fontFamily: "Inter", fontSizePt: 12, fontWeight: "bold", fontStyle: "normal", textAlign: "center", lineHeight: 1.2, width: 50, fill: "#000000" },
      { id: "i", name: "I", type: "image", panelId: "front", dx: 0, dy: 0, angle: 10, opacity: 0.5, visible: true, locked: true, assetId: "abc", width: 30, height: 20, flipX: false, flipY: true },
      { id: "l", name: "L", type: "line", panelId: "front", dx: 0, dy: 0, angle: 45, opacity: 1, visible: true, locked: false, length: 40, stroke: "#123456", strokeWidth: 0.5 },
    ];
    const r = artworkSchema.safeParse({ objects });
    expect(r.success).toBe(true);
  });

  it("rejects duplicate ids, bad colours, unknown fonts and unknown types", () => {
    expect(artworkSchema.safeParse({ objects: [rect(), rect()] }).success).toBe(false);
    expect(artworkSchema.safeParse({ objects: [rect({ fill: "red" } as Partial<ArtworkObject>)] }).success).toBe(false);
    expect(artworkSchema.safeParse({ objects: [{ ...rect(), type: "script" }] }).success).toBe(false);
    expect(
      artworkSchema.safeParse({
        objects: [{ id: "t", name: "T", type: "text", panelId: null, dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false, text: "x", fontFamily: "Comic Sans", fontSizePt: 12, fontWeight: "normal", fontStyle: "normal", textAlign: "left", lineHeight: 1, width: 10, fill: "#000000" }],
      }).success,
    ).toBe(false);
  });
});

describe("box background placement", () => {
  const g = geo({ width: 100, depth: 50, height: 150 });
  const b = g.bleedBounds;
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const base = { scale: 1, dx: 0, dy: 0 };

  it("cover fills the print area and keeps the image ratio", () => {
    const p = backgroundPlacement(g, { ...base, fit: "cover" }, 400, 200)!;
    expect(p.width).toBeGreaterThanOrEqual(w - 1e-9);
    expect(p.height).toBeGreaterThanOrEqual(h - 1e-9);
    expect(p.width / p.height).toBeCloseTo(2, 9);
    expect(p.cx).toBeCloseTo((b.min.x + b.max.x) / 2, 9);
    expect(p.clip).toEqual({ minX: b.min.x, minY: b.min.y, width: w, height: h });
  });

  it("contain fits inside the print area", () => {
    const p = backgroundPlacement(g, { ...base, fit: "contain" }, 400, 200)!;
    expect(p.width).toBeLessThanOrEqual(w + 1e-9);
    expect(p.height).toBeLessThanOrEqual(h + 1e-9);
    expect(p.width / p.height).toBeCloseTo(2, 9);
  });

  it("stretch matches the print area; scale and offset apply", () => {
    const p = backgroundPlacement(g, { fit: "stretch", scale: 2, dx: 5, dy: -3 }, 10, 10)!;
    expect(p.width).toBeCloseTo(2 * w, 9);
    expect(p.height).toBeCloseTo(2 * h, 9);
    expect(p.cx).toBeCloseTo((b.min.x + b.max.x) / 2 + 5, 9);
    expect(p.cy).toBeCloseTo((b.min.y + b.max.y) / 2 - 3, 9);
  });

  it("rejects an unusable image size", () => {
    expect(backgroundPlacement(g, { ...base, fit: "cover" }, 0, 10)).toBeNull();
  });

  it("schema: background is optional, validated when present", () => {
    expect(artworkSchema.safeParse({ objects: [] }).success).toBe(true);
    expect(artworkSchema.safeParse({ objects: [], background: null }).success).toBe(true);
    expect(artworkSchema.safeParse({ objects: [], background: { assetId: "a", fit: "cover", scale: 1, dx: 0, dy: 0, opacity: 1 } }).success).toBe(true);
    expect(artworkSchema.safeParse({ objects: [], background: { assetId: "a", fit: "zoom", scale: 1, dx: 0, dy: 0, opacity: 1 } }).success).toBe(false);
    expect(artworkSchema.safeParse({ objects: [], background: { assetId: "a", fit: "cover", scale: 99, dx: 0, dy: 0, opacity: 1 } }).success).toBe(false);
  });
});
