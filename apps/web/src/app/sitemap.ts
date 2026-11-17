import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { getPublicCatalogue } from "@/server/templates-public";

/**
 * /sitemap.xml: the public pages search engines may list: the home page, the sign-up and log-in pages, the list of dieline
 * templates and one page per published template. The editor, the dashboards and the clients' private shop links need a
 * sign-in or are marked noindex, so none of those are listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = new URL(env.BETTER_AUTH_URL).origin;
  const { templates } = await getPublicCatalogue();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/dielines`, changeFrequency: "weekly", priority: 0.9 },
    ...templates.map((t) => ({ url: `${base}/dielines/${t.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${base}/register`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
