"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users } from "lucide-react";

const items = [
  { href: "/doraadmin", label: "Overview", icon: LayoutDashboard },
  { href: "/doraadmin/users", label: "Users", icon: Users },
  { href: "/doraadmin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 px-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/doraadmin" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-muted font-medium" : "hover:bg-muted"}`}>
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
