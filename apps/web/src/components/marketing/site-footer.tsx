import Link from "next/link";
import { Suspense } from "react";
import { SiteBrand } from "@/components/site-brand";
import { getSiteContent } from "@/server/site-content";

const external = (href: string) => /^https?:\/\//i.test(href);

/** Footer of the public pages: the logo with a short text, and the link columns an admin set under Pages > Header and footer. */
export async function SiteFooter() {
  const { footer } = (await getSiteContent()).chrome;
  return (
    <footer className="border-t border-dashed border-[color-mix(in_oklab,var(--crease)_45%,transparent)] bg-card/60">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <div className="flex max-w-sm flex-col gap-4">
          <Link href="/" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
            <Suspense fallback={<span className="h-7 w-28" />}>
              <SiteBrand />
            </Suspense>
          </Link>
          {footer.tagline ? <p className="text-sm leading-relaxed text-muted-foreground">{footer.tagline}</p> : null}
        </div>
        {footer.columns.length ? (
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
            {footer.columns.map((col, i) => (
              <div key={`${col.title}-${i}`} className="flex flex-col gap-3">
                <p className="font-mono text-xs text-muted-foreground">{col.title}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {col.links.map((l, k) => (
                    <li key={`${l.href}-${k}`}>
                      {external(l.href) ? (
                        <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-[var(--cut)] hover:underline">{l.label}</a>
                      ) : (
                        <Link href={l.href} className="underline-offset-4 hover:text-[var(--cut)] hover:underline">{l.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        ) : null}
      </div>
      {footer.note ? <p className="border-t px-4 py-4 text-center font-mono text-xs text-muted-foreground">{footer.note}</p> : null}
    </footer>
  );
}
