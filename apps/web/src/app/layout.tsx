import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { Toaster } from "@/components/ui/sonner";
import { getSiteIdentity } from "@/server/site-identity";
import { getSeoSettings } from "@/server/seo-settings";
import { env } from "@/server/env";
import { withSite } from "@/lib/seo-settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The display face of the Client dashboard and the shared shop pages (headings and big numbers). */
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

/**
 * Site-wide head data: the tab title and its pattern, the description, link previews, the robots switch and the ownership
 * codes come from Settings > SEO; the name and the icon from Settings > Site Identity. A page can set its own title
 * and description on top of this (see server/seo-meta.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  const [{ title, faviconUrl }, seo] = await Promise.all([getSiteIdentity(), getSeoSettings()]);
  const defaultTitle = withSite(seo.defaultTitle || "{site}", title);
  return {
    metadataBase: new URL(env.BETTER_AUTH_URL),
    title: { default: defaultTitle, template: withSite(seo.titleTemplate || "%s | {site}", title) },
    description: seo.description || site.tagline,
    applicationName: title,
    ...(seo.keywords.length ? { keywords: seo.keywords } : {}),
    alternates: { canonical: "./" },
    robots: seo.indexing ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } } : { index: false, follow: false },
    openGraph: { type: "website", siteName: title, locale: "en_US", title: defaultTitle, description: seo.description || site.tagline, ...(seo.shareImage ? { images: [{ url: seo.shareImage, width: 1200, height: 630, alt: title }] } : {}) },
    twitter: { card: "summary_large_image", title: defaultTitle, description: seo.description || site.tagline, ...(seo.twitter ? { site: seo.twitter.startsWith("@") ? seo.twitter : `@${seo.twitter}` } : {}), ...(seo.shareImage ? { images: [seo.shareImage] } : {}) },
    ...(seo.googleVerification || seo.bingVerification ? { verification: { ...(seo.googleVerification ? { google: seo.googleVerification } : {}), ...(seo.bingVerification ? { other: { "msvalidate.01": seo.bingVerification } } : {}) } } : {}),
    ...(faviconUrl ? { icons: { icon: faviconUrl, shortcut: faviconUrl } } : {}),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* All pop-up messages (success, error, info, warning) appear here. See lib/notify.ts. */}
        <Toaster position="bottom-center" richColors closeButton />
      </body>
    </html>
  );
}
