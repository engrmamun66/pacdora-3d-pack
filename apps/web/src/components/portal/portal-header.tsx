"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, ShoppingCart, User } from "lucide-react";
import { notify } from "@/lib/notify";
import { formatPhone } from "@/lib/phone";
import { portalCart, portalHome, portalLogin, portalOrders } from "@/lib/portal-paths";
import { useCart } from "./cart";

/** Top bar of a Client's portal: the shop's logo and name, Templates / My orders, the cart, and the customer's sign-in. */
export function PortalHeader({ userHash, title, logoUrl, phone, homeScope }: { userHash: string; title: string; logoUrl: string | null; phone: string | null; homeScope: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const { count } = useCart(userHash);
  const link = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${on ? "font-medium text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-[var(--cut)]" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
    </Link>
  );
  const logout = async () => {
    await fetch("/api/portal/logout", { method: "POST" });
    notify.success("You are signed out.");
    router.refresh();
  };
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={portalHome(userHash, homeScope)} className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Client's own uploaded logo, served by our route
            <img src={logoUrl} alt="" className="h-9 max-w-32 shrink-0 object-contain" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-white"><Package className="size-[18px]" aria-hidden /></span>
          )}
          <span className="font-display truncate text-lg font-bold tracking-tight">{title}</span>
        </Link>
        <nav aria-label="Shop" className="ml-3 hidden items-center gap-1 sm:flex">
          {link(portalHome(userHash, homeScope), "Templates", path.includes("/templates"))}
          {phone ? link(portalOrders(userHash), "My orders", path.startsWith(portalOrders(userHash))) : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={portalCart(userHash)} aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`} className="relative grid size-10 place-items-center rounded-xl border bg-card shadow-xs transition-colors hover:border-[var(--crease)]">
            <ShoppingCart className="size-[18px]" aria-hidden />
            {count > 0 ? <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-[var(--cut)] px-1 font-mono text-[11px] leading-5 font-semibold text-white">{count > 99 ? "99+" : count}</span> : null}
          </Link>
          {phone ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden items-center gap-1.5 rounded-xl border bg-card px-3 py-2 font-mono text-xs shadow-xs md:flex"><User className="size-3.5" aria-hidden />{formatPhone(phone)}</span>
              <button type="button" onClick={() => void logout()} title="Sign out" aria-label="Sign out" className="grid size-10 place-items-center rounded-xl border bg-card shadow-xs transition-colors hover:border-[var(--crease)]"><LogOut className="size-[18px]" aria-hidden /></button>
            </div>
          ) : (
            <Link href={portalLogin(userHash, path)} className="cta inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium">Sign in</Link>
          )}
        </div>
      </div>
      <nav aria-label="Shop" className="flex gap-1 border-t px-3 py-1.5 sm:hidden">
        {link(portalHome(userHash, homeScope), "Templates", path.includes("/templates"))}
        {phone ? link(portalOrders(userHash), "My orders", path.startsWith(portalOrders(userHash))) : null}
      </nav>
    </header>
  );
}
