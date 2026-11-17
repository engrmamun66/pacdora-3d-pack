/**
 * Structured data (schema.org JSON-LD) for the home page: the company, the web site, the tool and the questions on the page.
 * Pure functions, so they can be tested. Only facts the site really states go in: no invented ratings or reviews.
 */
export interface HomeLdInput {
  origin: string;
  siteName: string;
  description: string;
  logoUrl: string | null;
  sameAs: string[];
  freeToUse: boolean;
  faq: { q: string; a: string }[];
}

const abs = (origin: string, path: string) => (/^https?:\/\//i.test(path) ? path : `${origin}${path}`);

export function homeJsonLd(i: HomeLdInput): Record<string, unknown>[] {
  const org: Record<string, unknown> = { "@type": "Organization", "@id": `${i.origin}/#organization`, name: i.siteName, url: `${i.origin}/` };
  if (i.logoUrl) org.logo = abs(i.origin, i.logoUrl);
  if (i.sameAs.length) org.sameAs = i.sameAs;
  const data: Record<string, unknown>[] = [
    org,
    { "@type": "WebSite", "@id": `${i.origin}/#website`, url: `${i.origin}/`, name: i.siteName, publisher: { "@id": `${i.origin}/#organization` }, inLanguage: "en" },
    {
      "@type": "SoftwareApplication",
      "@id": `${i.origin}/#app`,
      name: i.siteName,
      description: i.description,
      url: `${i.origin}/`,
      applicationCategory: "DesignApplication",
      operatingSystem: "Any (web browser)",
      publisher: { "@id": `${i.origin}/#organization` },
      featureList: ["Dieline generator from your own dimensions", "2D artwork editor", "Live 3D fold preview", "PDF, AI, EPS, SVG and DXF export with cut and crease layers"],
      ...(i.freeToUse ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } : {}),
    },
  ];
  if (i.faq.length) data.push({ "@type": "FAQPage", mainEntity: i.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  return data.map((d) => ({ "@context": "https://schema.org", ...d }));
}

export interface Crumb {
  name: string;
  path: string;
}

/** The trail "Home > Dielines > Tuck end box" for search results. */
export function breadcrumbJsonLd(origin: string, trail: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, n) => ({ "@type": "ListItem", position: n + 1, name: c.name, item: abs(origin, c.path) })),
  };
}

/** A list page: the templates on it, in order. */
export function itemListJsonLd(origin: string, name: string, items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((t, n) => ({ "@type": "ListItem", position: n + 1, name: t.name, url: abs(origin, t.path) })),
  };
}

/** The text of JSON-LD put in a <script>: "<" is escaped so the data can never close the tag. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
