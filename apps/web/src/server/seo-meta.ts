import "server-only";
import type { Metadata } from "next";
import { getSeoSettings } from "./seo-settings";
import { getSiteIdentity } from "./site-identity";
import { fullTitle, withSite, type SeoPageKey } from "@/lib/seo-settings";

/**
 * Metadata of a public page from Settings > SEO: its title (inside the site's pattern), description, canonical address and the
 * Open Graph / Twitter data for link previews. `path` is the page's own path, like "/dielines".
 */
export async function pageMetadata(key: SeoPageKey, path: string): Promise<Metadata> {
  const [seo, identity] = await Promise.all([getSeoSettings(), getSiteIdentity()]);
  const own = seo.pages[key];
  const title = key === "home" && !own.title ? withSite(seo.defaultTitle || "{site}", identity.title) : fullTitle(own.title || identity.title, seo, identity.title);
  const description = own.description || seo.description;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: identity.title, title, description, url: path },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Metadata of one template's public page: its own name and description, inside the site's pattern. */
export async function templateMetadata(t: { id: string; name: string; description: string; productImage: string | null }): Promise<Metadata> {
  const [seo, identity] = await Promise.all([getSeoSettings(), getSiteIdentity()]);
  const title = fullTitle(`${t.name} dieline template`, seo, identity.title);
  const description = (t.description.trim() || `${t.name} dieline: enter your own size, add artwork, fold it in 3D and export print-ready files.`).slice(0, 200);
  const path = `/dielines/${t.id}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: identity.title, title, description, url: path, ...(t.productImage ? { images: [{ url: t.productImage, alt: `${t.name}, folded` }] } : {}) },
    twitter: { card: "summary_large_image", title, description },
  };
}
