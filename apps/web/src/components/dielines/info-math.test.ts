import { describe, expect, it } from "vitest";
import { generateDieline } from "@packaging/dieline-engine";
import { boxSizes, dielineStats, fmtLen, fmtSize } from "./info-math";

describe("box sizes", () => {
  it("manufacture mode: the typed size is the panel size; inner and outer follow the allowance rule", () => {
    const s = boxSizes([260, 120, 60], "manufacture", 1.5, 1);
    expect(s.manufacturing).toEqual([260, 120, 60]);
    expect(s.inner).toEqual([258.5, 118.5, 58.5]);
    expect(s.outer).toEqual([261.5, 121.5, 61.5]);
  });
  it("inner mode: the typed size is the inside size, the panels are bigger", () => {
    const s = boxSizes([258, 116, 59], "inner", 1, 1);
    expect(s.inner).toEqual([258, 116, 59]);
    expect(s.manufacturing).toEqual([259, 117, 60]);
    expect(s.outer).toEqual([260, 118, 61]);
  });
  it("a bigger allowance factor widens the gap between panel size and inner size", () => {
    expect(boxSizes([100, 50, 80], "manufacture", 2, 2).inner).toEqual([96, 46, 76]);
  });
});

describe("formatting", () => {
  it("shows sizes and lengths in the chosen unit", () => {
    expect(fmtSize([260, 120, 60], "mm")).toBe("260 × 120 × 60 mm");
    expect(fmtSize([268.5, 128, 62], "mm")).toBe("268.5 × 128 × 62 mm");
    expect(fmtSize([25.4, 50.8], "in")).toBe("1 × 2 in");
    expect(fmtLen(3496.567, "mm")).toBe("3496.57 mm");
    expect(fmtLen(254, "in")).toBe("10 in");
  });
});

describe("dieline statistics", () => {
  const geo = generateDieline("tuck-end-carton", { width: 70, depth: 40, height: 120 });
  const st = dielineStats(geo);
  it("measures the cut and fold lines and the sheet with bleed", () => {
    expect(st.cutLength).toBeGreaterThan(0);
    expect(st.creaseLength).toBeGreaterThan(0);
    const cb = geo.cutBounds;
    expect(st.area.w).toBeCloseTo(cb.max.x - cb.min.x + 2 * 3, 1); // default bleed 3 mm each side
    expect(st.area.h).toBeCloseTo(cb.max.y - cb.min.y + 2 * 3, 1);
  });
  it("the cut length is at least the outline of the sheet", () => {
    const w = geo.cutBounds.max.x - geo.cutBounds.min.x;
    const h = geo.cutBounds.max.y - geo.cutBounds.min.y;
    expect(st.cutLength).toBeGreaterThanOrEqual(2 * (w + h) * 0.5);
  });
});
