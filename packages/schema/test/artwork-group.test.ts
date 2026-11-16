import { describe, expect, it } from "vitest";
import { artworkObject } from "../src/artwork";

const rect = { id: "a1", name: "Box", panelId: "front", dx: 0, dy: 0, angle: 0, opacity: 1, visible: true, locked: false, type: "rect", width: 10, height: 10, cornerRadius: 0, fill: "#ff0000", stroke: null, strokeWidth: 0 };

describe("artwork groups", () => {
  it("an object without a groupId is valid (older files)", () => {
    const p = artworkObject.safeParse(rect);
    expect(p.success).toBe(true);
    expect(p.success && p.data.groupId).toBeUndefined();
  });

  it("keeps a groupId on every object type", () => {
    const p = artworkObject.safeParse({ ...rect, groupId: "g-1" });
    expect(p.success && p.data.groupId).toBe("g-1");
    const line = artworkObject.safeParse({ ...rect, type: "line", length: 20, stroke: "#000000", strokeWidth: 0.5, groupId: "g-1", width: undefined, height: undefined });
    expect(line.success && line.data.groupId).toBe("g-1");
  });

  it("rejects an empty or very long groupId", () => {
    expect(artworkObject.safeParse({ ...rect, groupId: "" }).success).toBe(false);
    expect(artworkObject.safeParse({ ...rect, groupId: "x".repeat(41) }).success).toBe(false);
  });
});
