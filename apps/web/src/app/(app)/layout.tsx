import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LayoutDashboard, Shapes, FolderOpen, Settings } from "lucide-react";
import { SiteTitle } from "@/components/site-brand";
import { UserMenu } from "@/components/app/user-menu";

const nav = [
  { href: "/my-dashboard", label: "My dashboard", icon: LayoutDashboard },
  { href: "/templates", label: "Templates", icon: Shapes },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Shell for signed-in pages. The layout itself stays static (cacheComponents):
 * the session is read only inside Suspense boundaries (UserMenu, page content),
 * and every page/action re-checks auth on the server.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="flex flex-col border-r bg-muted/30">
        <Link href="/my-dashboard" className="px-5 py-4 font-semibold">
          <Suspense fallback={null}>
            <SiteTitle />
          </Suspense>
        </Link>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-end border-b px-6">
          <Suspense fallback={<div className="size-8 rounded-full bg-muted" />}>
            <UserMenu />
          </Suspense>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
