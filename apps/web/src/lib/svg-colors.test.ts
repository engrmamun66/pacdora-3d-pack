import { describe, expect, it } from "vitest";
import { EMPTY_SVG_COLORS, colorRoles, parseSvgColors, svgColorSchema } from "./svg-colors";

describe("SVG dieline colours", () => {
  const s = (key: string, stroke: string) => ({ key, stroke });

  it("maps a style to the role that owns its colour, ignoring case", () => {
    const cfg = parseSvgColors({ cut: ["#E6007E", "#ff0000"], crease: ["#00a0e9"], bleed: [], guide: ["#2ca02c"], ignore: ["#bbbbbb"] });
    const r = colorRoles([s("a", "#e6007e"), s("b", "#FF0000"), s("c", "#00a0e9"), s("d", "#2ca02c"), s("e", "#bbbbbb"), s("f", "#123456")], cfg);
    expect(r).toEqual({ a: "cut", b: "cut", c: "crease", d: "guide", e: "ignore" });
  });

  it("leaves unmatched colours out so the importer's guess still applies", () => {
    expect(colorRoles([s("x", "#010203")], EMPTY_SVG_COLORS)).toEqual({});
  });

  it("rejects a colour listed under two roles", () => {
    const r = svgColorSchema.safeParse({ cut: ["#ff0000"], crease: ["#FF0000"] });
    expect(r.success).toBe(false);
  });

  it("rejects bad hex and falls back to empty when reading junk", () => {
    expect(svgColorSchema.safeParse({ cut: ["red"] }).success).toBe(false);
    expect(parseSvgColors("nope")).toEqual(EMPTY_SVG_COLORS);
    expect(parseSvgColors({ cut: ["#ff0000"] })).toEqual({ ...EMPTY_SVG_COLORS, cut: ["#ff0000"] });
  });
});
