import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Menu } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { site } from "@/config/site";
import { getSession } from "@/server/session";

const NAV = [
  { href: "/templates", label: "Templates" },
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#formats", label: "File formats" },
];

/** Shows the right buttons for the visitor. If the session lookup fails (e.g. database down) the page still renders signed-out. */
async function AuthButtons() {
  // The session is per visitor: read it at request time, so the rest of the page can still be prerendered.
  await connection();
  let signedIn = false;
  try {
    signedIn = Boolean(await getSession());
  } catch {
    signedIn = false;
  }
  return signedIn ? (
    <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
  ) : (
    <>
      <ButtonLink variant="ghost" href="/login">Log in</ButtonLink>
      <ButtonLink href="/register">Get started</ButtonLink>
    </>
  );
}

/** `solid`: for inner pages. A bar that stays on top of the page, instead of floating over the home hero. */
export function SiteHeader({ solid = false }: { solid?: boolean }) {
  return (
    <header className={solid ? "sticky top-0 z-20 border-b bg-background/90 backdrop-blur" : "absolute inset-x-0 top-0 z-20"}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
          </span>
          {site.name}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Suspense fallback={<div className="h-8 w-40" />}>
            <AuthButtons />
          </Suspense>
        </div>

        {/* Small screens: a plain <details> menu, no JavaScript needed. */}
        <details className="group relative ml-auto md:hidden">
          <summary aria-label="Menu" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border bg-background [&::-webkit-details-marker]:hidden">
            <Menu className="size-5" />
          </summary>
          <div className="absolute right-0 mt-2 flex w-56 flex-col gap-1 rounded-xl border bg-background p-2 shadow-lg">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
                {n.label}
              </Link>
            ))}
            <div className="mt-1 flex gap-2 border-t pt-2">
              <Suspense fallback={null}>
                <AuthButtons />
              </Suspense>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
