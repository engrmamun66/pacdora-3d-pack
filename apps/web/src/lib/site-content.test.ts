import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT, HOME_SECTIONS, PART_SCHEMAS, featureSpans, isSafeHref, normalizeSections, parseSiteContent } from "./site-content";

describe("site content", () => {
  it("has defaults that pass their own rules", () => {
    for (const k of ["home", "templatesPage", "chrome", "seo"] as const) expect(PART_SCHEMAS[k].safeParse(DEFAULT_CONTENT[k]).success).toBe(true);
  });

  it("falls back to the defaults part by part", () => {
    expect(parseSiteContent(null)).toEqual(DEFAULT_CONTENT);
    expect(parseSiteContent("nonsense")).toEqual(DEFAULT_CONTENT);
    const mixed = parseSiteContent({ home: { broken: true }, templatesPage: { title: "Boxes", subtitle: "" } });
    expect(mixed.home).toEqual(DEFAULT_CONTENT.home);
    expect(mixed.templatesPage).toEqual({ title: "Boxes", subtitle: "" });
    expect(mixed.chrome).toEqual(DEFAULT_CONTENT.chrome);
  });

  it("only lets safe addresses through", () => {
    for (const ok of ["/templates", "/#faq", "#faq", "https://example.com/a?b=1", "http://example.com", "mailto:hi@example.com"]) expect(isSafeHref(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "templates", "", "/a b", 'https://x"y']) expect(isSafeHref(bad)).toBe(false);
    const bad = PART_SCHEMAS.chrome.safeParse({ ...DEFAULT_CONTENT.chrome, nav: [{ label: "Bad", href: "javascript:alert(1)" }] });
    expect(bad.success).toBe(false);
  });

  it("keeps the section list complete, in the stored order, without doubles", () => {
    const out = normalizeSections([{ id: "faq", on: false }, { id: "tape", on: true }, { id: "faq", on: true }]);
    expect(out.slice(0, 2)).toEqual([{ id: "faq", on: false }, { id: "tape", on: true }]);
    expect(out).toHaveLength(HOME_SECTIONS.length);
    expect(new Set(out.map((s) => s.id)).size).toBe(HOME_SECTIONS.length);
    expect(out.slice(2).every((s) => s.on)).toBe(true);
  });

  it("fills every row of the feature grid", () => {
    expect(featureSpans(0)).toEqual([]);
    expect(featureSpans(1)).toEqual([3]);
    for (let n = 2; n <= 9; n++) {
      const spans = featureSpans(n);
      expect(spans).toHaveLength(n);
      expect(spans[0]).toBe(2);
      expect(spans.reduce((a, b) => a + b, 0) % 3).toBe(0);
    }
    expect(featureSpans(6)).toEqual([2, 1, 1, 1, 1, 3]);
  });
});
