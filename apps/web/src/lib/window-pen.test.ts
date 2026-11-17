import { describe, expect, it } from "vitest";
import { cornerAnchor, flattenPath, insertAnchor, moveAnchor, nearestOnPath, pathData, setHandle, snap45, toggleSmooth, type Anchor } from "./window-pen";

const square: Anchor[] = [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 10, y: 0 }), cornerAnchor({ x: 10, y: 10 }), cornerAnchor({ x: 0, y: 10 })];

describe("window pen path", () => {
  it("corners only make a straight polygon", () => {
    expect(flattenPath(square, true)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(pathData(square, true)).toBe("M0 0L10 0L10 10L0 10L0 0Z");
  });

  it("handles make a curve that bulges toward them and stays one piece", () => {
    const bent = setHandle(setHandle(square, 0, "hout", { x: 5, y: -8 }), 1, "hin", { x: 5, y: -8 });
    const pts = flattenPath(bent, true);
    expect(pts.length).toBeGreaterThan(8);
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(-3); // pulled up above the top edge
    expect(pathData(bent, true)).toContain("C");
  });

  it("a smooth anchor keeps its two handles in one line when one is moved", () => {
    const smooth = toggleSmooth(square, true, 1);
    expect(smooth[1]!.smooth).toBe(true);
    const turned = setHandle(smooth, 1, "hout", { x: 10, y: 5 });
    const a = turned[1]!;
    // hin is opposite hout through the anchor, at its old distance.
    expect(a.hin!.x - a.x).toBeCloseTo(-(a.hout!.x - a.x) * (Math.hypot(smooth[1]!.hin!.x - a.x, smooth[1]!.hin!.y - a.y) / Math.hypot(a.hout!.x - a.x, a.hout!.y - a.y)), 6);
    expect(Math.sign(a.hin!.y - a.y)).toBe(-Math.sign(a.hout!.y - a.y));
    // Alt: moving one handle alone breaks the link.
    const broken = setHandle(smooth, 1, "hout", { x: 14, y: 5 }, true);
    expect(broken[1]!.smooth).toBe(false);
    expect(broken[1]!.hin).toEqual(smooth[1]!.hin);
    // Toggling again removes the handles.
    expect(toggleSmooth(smooth, true, 1)[1]).toMatchObject({ hin: null, hout: null, smooth: false });
  });

  it("moves an anchor together with its handles", () => {
    const smooth = toggleSmooth(square, true, 1);
    const moved = moveAnchor(smooth, 1, { x: 12, y: 3 });
    expect(moved[1]!.hout!.x - moved[1]!.x).toBeCloseTo(smooth[1]!.hout!.x - smooth[1]!.x, 9);
    expect(moved[1]!.hin!.y - moved[1]!.y).toBeCloseTo(smooth[1]!.hin!.y - smooth[1]!.y, 9);
  });

  it("adds an anchor on a segment without changing its shape", () => {
    const near = nearestOnPath(square, true, { x: 5, y: 0.4 })!;
    expect(near.seg).toBe(0);
    expect(near.point.y).toBeCloseTo(0, 9);
    const more = insertAnchor(square, true, near.seg, near.t);
    expect(more).toHaveLength(5);
    expect(more[1]!.x).toBeCloseTo(5, 6);
    // A curve is split in two with the same outline.
    const bent = setHandle(setHandle(square, 0, "hout", { x: 3, y: -6 }), 1, "hin", { x: 7, y: -6 });
    const before = flattenPath(bent, true);
    const split = flattenPath(insertAnchor(bent, true, 0, 0.5), true);
    const top = (pts: { y: number }[]) => Math.min(...pts.map((p) => p.y));
    expect(top(split)).toBeCloseTo(top(before), 1);
    // The closing segment puts the new anchor at the end.
    expect(insertAnchor(square, true, 3, 0.5)).toHaveLength(5);
    expect(insertAnchor(square, true, 3, 0.5)[4]!.x).toBeCloseTo(0, 6);
  });

  it("rubber band and shift", () => {
    expect(pathData([square[0]!], false, { x: 4, y: 4 })).toBe("M0 0L4 4");
    const p = snap45({ x: 0, y: 0 }, { x: 10, y: 3 });
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.x).toBeCloseTo(Math.hypot(10, 3), 6);
  });

  it("keeps the point count down", () => {
    const wavy = Array.from({ length: 40 }, (_, i) => ({ ...cornerAnchor({ x: i * 40, y: (i % 2) * 40 }), hout: { x: i * 40 + 20, y: 100 }, hin: { x: i * 40 - 20, y: -100 }, smooth: true }));
    expect(flattenPath(wavy, true, 1200).length).toBeLessThanOrEqual(1200);
  });
});
