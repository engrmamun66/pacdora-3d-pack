import { describe, expect, it } from "vitest";
import { readTemplateWindows } from "./template-windows";

const good = { id: "w1", shape: "circle", cx: 10, cy: 20, width: 12, height: 12, rotation: 0 };

describe("readTemplateWindows", () => {
  it("reads saved windows", () => {
    expect(readTemplateWindows([good])).toEqual([good]);
  });
  it("reads anything else as none (null, wrong shape, bad numbers)", () => {
    expect(readTemplateWindows(null)).toEqual([]);
    expect(readTemplateWindows({ windows: [good] })).toEqual([]);
    expect(readTemplateWindows([{ ...good, width: -1 }])).toEqual([]);
  });
  it("reads a list over the limit as none", () => {
    expect(readTemplateWindows(Array.from({ length: 25 }, (_, i) => ({ ...good, id: `w${i}` })))).toEqual([]);
  });
});
