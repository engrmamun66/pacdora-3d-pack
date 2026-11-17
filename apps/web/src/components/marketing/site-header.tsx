import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Menu } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { SiteBrand } from "@/components/site-brand";
import { getSession } from "@/server/session";
import { UserMenu } from "@/components/app/user-menu";
import { ScrollHeader } from "./scroll-header";
import { Announcement } from "./announcement";
import { getSiteContent } from "@/server/site-content";

/** Shows the right buttons for the visitor. If the session lookup fails (e.g. database down) the page still renders signed-out. */
async function AuthButtons({ inApp = false }: { inApp?: boolean }) {
  // The session is per visitor: read it at request time, so the rest of the page can still be prerendered.
  await connection();
  let signedIn = false;
  try {
    signedIn = Boolean(await getSession());
  } catch {
    signedIn = false;
  }
  // Inside the customer area the dashboard button would point at the page you are on: show the account menu instead.
  if (signedIn && inApp) return <UserMenu />;
  return signedIn ? (
    <ButtonLink href="/my-dashboard">Open dashboard</ButtonLink>
  ) : (
    <>
      <ButtonLink variant="ghost" href="/login">Log in</ButtonLink>
      <ButtonLink href="/register">Get started</ButtonLink>
    </>
  );
}

/**
 * The menu of the public pages. Its links and the announcement bar above it are set under Admin > Pages > Header and footer.
 * `solid`: for inner pages. A bar that stays on top of the page, instead of floating over the home hero.
 */
export async function SiteHeader({ solid = false, inApp = false, background = null }: { solid?: boolean; /** Customer pages: the signed-in visitor gets the account menu. */ inApp?: boolean; /** Home page: colour the bar takes once the page has scrolled (the hero's colour). */ background?: string | null }) {
  const { nav, announcement } = (await getSiteContent()).chrome;
  const note = announcement.on && announcement.text ? <Announcement text={announcement.text} link={announcement.link.label && announcement.link.href ? announcement.link : null} /> : null;
  const bar = (
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
          <Suspense fallback={<span className="h-7 w-28" />}>
            <SiteBrand />
          </Suspense>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link key={`${n.href}-${n.label}`} href={n.href} className="relative rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--cut,currentColor)] after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Suspense fallback={<div className="h-8 w-40" />}>
            <AuthButtons inApp={inApp} />
          </Suspense>
        </div>

        {/* Small screens: a plain <details> menu, no JavaScript needed. */}
        <details className="group relative ml-auto md:hidden">
          <summary aria-label="Menu" className="flex size-10 cursor-pointer list-none items-center justify-center rounded-xl border bg-background shadow-xs [&::-webkit-details-marker]:hidden">
            <Menu className="size-5" />
          </summary>
          <div className="absolute right-0 mt-2 flex w-60 flex-col gap-1 rounded-2xl border bg-background p-2 shadow-xl">
            {nav.map((n) => (
              <Link key={`${n.href}-${n.label}`} href={n.href} className="rounded-lg px-3 py-2.5 text-sm hover:bg-muted">
                {n.label}
              </Link>
            ))}
            <div className="mt-1 flex flex-wrap gap-2 border-t pt-2">
              <Suspense fallback={null}>
                <AuthButtons inApp={inApp} />
              </Suspense>
            </div>
          </div>
        </details>
      </div>
  );
  return solid ? (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
      {note}
      {bar}
    </header>
  ) : (
    <ScrollHeader background={background} top={note}>{bar}</ScrollHeader>
  );
}
