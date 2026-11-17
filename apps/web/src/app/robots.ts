import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { getSeoSettings } from "@/server/seo-settings";

/**
 * /robots.txt: the public site may be crawled; the signed-in areas and the API may not. It points to the sitemap.
 * When Settings > SEO switches indexing off, the whole site is closed to crawlers.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = new URL(env.BETTER_AUTH_URL).origin;
  const seo = await getSeoSettings();
  if (!seo.indexing) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/doraadmin", "/my-dashboard", "/projects", "/editor", "/template/", "/templates", "/dashboard", "/*?next="] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
