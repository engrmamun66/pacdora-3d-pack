import { describe, expect, it } from "vitest";
import { DEFAULT_WATERMARK_SETTINGS, DEFAULT_WATERMARK_TEXT, parseWatermark, watermarkSchema, watermarkText } from "./watermark-settings";

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
    expect(parseWatermark({ text: "Shop" })).toEqual({ enabled: true, text: "Shop" });
    expect(parseWatermark({ enabled: "yes" })).toEqual(DEFAULT_WATERMARK_SETTINGS);
  });

  it("rejects a text that is too long", () => {
    expect(watermarkSchema.safeParse({ enabled: true, text: "x".repeat(41) }).success).toBe(false);
  });
});
