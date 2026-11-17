import { site } from "@/config/site";
import { ogCard } from "@/lib/og-card";
import { getSiteIdentity } from "@/server/site-identity";

export const alt = site.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** /opengraph-image: the picture shown when a link to the site is shared (unless Settings > SEO names another). */
export default async function Image() {
  const { title } = await getSiteIdentity();
  return ogCard(title, site.tagline);
}
