import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { Toaster } from "@/components/ui/sonner";
import { getSiteIdentity } from "@/server/site-identity";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Tab title and icon come from Settings > Site Identity (cached; the default name and icon if nothing is set). */
export async function generateMetadata(): Promise<Metadata> {
  const { title, faviconUrl } = await getSiteIdentity();
  return {
    title: { default: title, template: `%s | ${title}` },
    description: site.tagline,
    ...(faviconUrl ? { icons: { icon: faviconUrl, shortcut: faviconUrl } } : {}),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* All pop-up messages (success, error, info, warning) appear here. See lib/notify.ts. */}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
