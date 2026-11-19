import Link from "next/link";
import type { Metadata } from "next";
import { Home } from "lucide-react";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

/** Every address that does not exist (and every page that calls notFound()): says so and leads back to the home page. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
      <p className="font-display text-7xl font-bold tracking-tight text-muted-foreground/60">404</p>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold">This page could not be found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The address may be wrong, or the page was removed or turned off. Go back to the home page and start from there.</p>
      </div>
      <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
        <Home className="size-4" aria-hidden /> Go to the home page
      </Link>
    </main>
  );
}
