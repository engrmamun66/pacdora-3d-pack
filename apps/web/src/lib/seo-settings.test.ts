import { describe, expect, it } from "vitest";
import { DEFAULT_SEO, fullTitle, parseSeoSettings, seoSettingsSchema, withSite } from "./seo-settings";

describe("seo settings", () => {
  it("has built-in data that passes its own rules and fits the usual lengths", () => {
    expect(seoSettingsSchema.safeParse(DEFAULT_SEO).success).toBe(true);
    expect(withSite(DEFAULT_SEO.defaultTitle, "Dieline Studio").length).toBeLessThanOrEqual(80);
    expect(DEFAULT_SEO.description.length).toBeLessThanOrEqual(170);
    for (const p of Object.values(DEFAULT_SEO.pages)) expect(p.description.length).toBeLessThanOrEqual(200);
  });

  it("falls back to the built-in data when the stored value is unusable", () => {
    expect(parseSeoSettings(null)).toEqual(DEFAULT_SEO);
    expect(parseSeoSettings({ indexing: "yes" })).toEqual(DEFAULT_SEO);
  });

  it("puts the site name and the page title into the pattern", () => {
    expect(fullTitle("Log in", DEFAULT_SEO, "Studio")).toBe("Log in | Studio");
    expect(fullTitle("Log in", { ...DEFAULT_SEO, titleTemplate: "" }, "Studio")).toBe("Log in | Studio");
    expect(fullTitle("Log in", { ...DEFAULT_SEO, titleTemplate: "{site} - %s" }, "Studio")).toBe("Studio - Log in");
  });

  it("refuses a pattern without %s, an unsafe address and a pasted whole tag", () => {
    expect(seoSettingsSchema.safeParse({ ...DEFAULT_SEO, titleTemplate: "no marker" }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...DEFAULT_SEO, shareImage: "javascript:alert(1)" }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...DEFAULT_SEO, sameAs: ["ftp://x.com"] }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...DEFAULT_SEO, googleVerification: '<meta name="x" content="y">' }).success).toBe(false);
    expect(seoSettingsSchema.safeParse({ ...DEFAULT_SEO, twitter: "@name" }).success).toBe(true);
  });
});
