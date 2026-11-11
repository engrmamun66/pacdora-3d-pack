import { describe, expect, it } from "vitest";
import { DEFAULT_WATERMARK_SETTINGS, DEFAULT_WATERMARK_STYLE, DEFAULT_WATERMARK_TEXT, parseWatermark, watermarkSchema, watermarkText } from "./watermark-settings";

describe("watermark settings", () => {
  it("shows the default text when nothing is stored", () => {
    expect(parseWatermark(null)).toEqual(DEFAULT_WATERMARK_SETTINGS);
    expect(watermarkText(parseWatermark(undefined))).toBe(DEFAULT_WATERMARK_TEXT);
  });

  it("uses the admin's text, tidied", () => {
    expect(watermarkText(parseWatermark({ enabled: true, text: "  My   Brand  " }))).toBe("My Brand");
  });

  it("an empty text means the default; switched off means none", () => {
    expect(watermarkText({ enabled: true, text: "" })).toBe(DEFAULT_WATERMARK_TEXT);
    expect(watermarkText({ enabled: false, text: "Shop" })).toBe("");
  });

  it("reads older partial values and ignores junk", () => {
    expect(parseWatermark({ text: "Shop" })).toEqual({ enabled: true, text: "Shop", ...DEFAULT_WATERMARK_STYLE });
    expect(parseWatermark({ enabled: "yes" })).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });

  it("rejects a text that is too long", () => {
    expect(watermarkSchema.safeParse({ enabled: true, text: "x".repeat(41) }).success).toBe(false);
  });

  it("reads the look, with defaults for what is missing", () => {
    const s = parseWatermark({ enabled: true, text: "", textColor: "#FF0000", fontSize: 6 });
    expect(s).toMatchObject({ textColor: "#ff0000", lineColor: DEFAULT_WATERMARK_STYLE.lineColor, fontSize: 6, lineWidth: DEFAULT_WATERMARK_STYLE.lineWidth });
  });

  it("rejects bad colours and sizes", () => {
    for (const bad of [{ textColor: "red" }, { lineColor: "#12345" }, { fontSize: 0.5 }, { fontSize: 50 }, { lineWidth: -1 }, { lineWidth: 9 }]) {
      expect(watermarkSchema.safeParse({ enabled: true, text: "", ...bad }).success).toBe(false);
    }
    expect(watermarkSchema.safeParse({ enabled: true, text: "", lineWidth: 0 }).success).toBe(true);
  });
});
