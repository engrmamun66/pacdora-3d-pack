"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Home, Server } from "lucide-react";

const TABS = [
  { href: "/doraadmin/settings", label: "Home page", icon: Home },
  { href: "/doraadmin/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/doraadmin/settings/system", label: "System status", icon: Server },
];

/** Settings sections: a vertical list on the left on wide screens, a scrollable row on narrow ones. */
export function SettingsTabs() {
  const path = usePathname().replace(/\/$/, "");
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
