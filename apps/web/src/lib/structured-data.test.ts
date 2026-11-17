import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, homeJsonLd, itemListJsonLd, jsonLdText } from "./structured-data";

const base = { origin: "https://example.com", siteName: "Site", description: "d", logoUrl: null, sameAs: [], freeToUse: true, faq: [{ q: "Q?", a: "A." }] };

describe("structured data", () => {
  it("describes the company, the site, the tool and the questions", () => {
    const d = homeJsonLd(base);
    expect(d.map((x) => x["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
    expect(d.every((x) => x["@context"] === "https://schema.org")).toBe(true);
    expect(JSON.stringify(d)).not.toContain("aggregateRating");
  });

  it("states a free offer only when it is free, and links profiles and the logo only when given", () => {
    expect(JSON.stringify(homeJsonLd({ ...base, freeToUse: false }))).not.toContain("Offer");
    expect(JSON.stringify(homeJsonLd(base))).toContain('"price":"0"');
    const withMore = homeJsonLd({ ...base, logoUrl: "/api/site/logo?v=1", sameAs: ["https://x.com/a"] });
    expect(withMore[0]).toMatchObject({ logo: "https://example.com/api/site/logo?v=1", sameAs: ["https://x.com/a"] });
    expect(homeJsonLd({ ...base, faq: [] }).some((x) => x["@type"] === "FAQPage")).toBe(false);
  });

  it("numbers breadcrumbs and list items from 1 with full addresses", () => {
    const b = breadcrumbJsonLd("https://example.com", [{ name: "Home", path: "/" }, { name: "Dielines", path: "/dielines" }]) as { itemListElement: { position: number; item: string }[] };
    expect(b.itemListElement.map((e) => e.position)).toEqual([1, 2]);
    expect(b.itemListElement[1]!.item).toBe("https://example.com/dielines");
    const l = itemListJsonLd("https://example.com", "L", [{ name: "A", path: "/dielines/a" }]) as { itemListElement: { url: string }[] };
    expect(l.itemListElement[0]!.url).toBe("https://example.com/dielines/a");
  });

  it("cannot be used to close the script tag", () => {
    const t = jsonLdText({ a: "</script><script>alert(1)</script>" });
    expect(t).not.toContain("</script>");
    expect(JSON.parse(t).a).toBe("</script><script>alert(1)</script>");
  });
});
