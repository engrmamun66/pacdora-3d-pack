import { describe, expect, it } from "vitest";
import { generateDieline, getGenerator } from "@packaging/dieline-engine";
import { computeParamPanels } from "./param-panels";

describe("computeParamPanels", () => {
  const gen = getGenerator("tuck-end-carton");
  const input = { width: 100, depth: 50, height: 150 };
  const rel = computeParamPanels((p) => generateDieline("tuck-end-carton", p), input, gen.params);

  it("finds the panels each size reaches", () => {
    expect(rel.byParam.get("height")?.length).toBeGreaterThan(0);
    expect(rel.byParam.get("width")?.length).toBeGreaterThan(0);
    // The front panel is as wide as the box and as tall as it: both settings reach it, and the depth does not change its width.
    expect(rel.byPanel.get("front")).toEqual(expect.arrayContaining(["width", "height"]));
  });

  it("goes both ways", () => {
    for (const [key, ids] of rel.byParam) for (const id of ids) expect(rel.byPanel.get(id)).toContain(key);
  });

  it("skips a setting the generator refuses", () => {
    const refuse = computeParamPanels((p) => {
      if ((p as { height: number }).height !== 150) throw new Error("no");
      return generateDieline("tuck-end-carton", p);
    }, input, gen.params);
    expect(refuse.byParam.has("height")).toBe(false);
  });
});
