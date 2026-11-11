"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Shapes, Tags, Users, type LucideIcon } from "lucide-react";
import { useAdminDrawer } from "./admin-shell";

const GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/doraadmin", label: "Overview", icon: LayoutDashboard },
      { href: "/doraadmin/templates", label: "Templates", icon: Shapes },
      { href: "/doraadmin/template-categories", label: "Categories", icon: Tags },
    ],
  },
  { title: "People", items: [{ href: "/doraadmin/users", label: "Users", icon: Users }] },
  { title: "System", items: [{ href: "/doraadmin/settings", label: "Settings", icon: Settings }] },
];

export function AdminNav() {
  const path = usePathname();
  const { close } = useAdminDrawer();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-6 md:group-data-[sidebar=collapsed]/shell:gap-3">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-1 md:group-data-[sidebar=collapsed]/shell:not-first:border-t md:group-data-[sidebar=collapsed]/shell:not-first:border-sidebar-border md:group-data-[sidebar=collapsed]/shell:not-first:pt-3">
          <p className="px-3 pb-1 text-xs font-medium text-sidebar-foreground/50 md:group-data-[sidebar=collapsed]/shell:sr-only">{g.title}</p>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/doraadmin" ? path === href : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                title={label}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm md:group-data-[sidebar=collapsed]/shell:justify-center transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}
              >
                {active ? <span aria-hidden className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" /> : null}
                <Icon className={`size-4 ${active ? "text-sidebar-primary" : ""}`} aria-hidden />
                <span className="md:group-data-[sidebar=collapsed]/shell:sr-only">{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
