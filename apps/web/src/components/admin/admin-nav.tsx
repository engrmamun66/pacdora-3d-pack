"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutTemplate, Settings, Shapes, Tags, Users, type LucideIcon } from "lucide-react";
import { useAdminDrawer } from "./admin-shell";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Submenu: the parent is only a heading, the pages are the children. */
  children?: { href: string; label: string; icon: LucideIcon }[];
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/doraadmin", label: "Overview", icon: LayoutDashboard },
      { href: "/doraadmin/templates", label: "Templates", icon: Shapes },
      { href: "/doraadmin/template-categories", label: "Categories", icon: Tags },
    ],
  },
  {
    title: "People",
    items: [
      {
        href: "/doraadmin/users",
        label: "Users",
        icon: Users,
        children: [
          { href: "/doraadmin/users", label: "All Customers", icon: Users },
          { href: "/doraadmin/users/templates", label: "Customer Templates", icon: LayoutTemplate },
        ],
      },
    ],
  },
  { title: "System", items: [{ href: "/doraadmin/settings", label: "Settings", icon: Settings }] },
];

export function AdminNav() {
  const path = usePathname();
  const { close } = useAdminDrawer();
  // The most specific link wins, so "All Customers" is not lit up on the Customer Templates page.
  const hrefs = GROUPS.flatMap((g) => g.items.flatMap((i) => (i.children ? i.children.map((c) => c.href) : [i.href])));
  const current = hrefs.filter((h) => (h === "/doraadmin" ? path === h : path === h || path.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Admin" className="flex flex-col gap-6 md:group-data-[sidebar=collapsed]/shell:gap-3">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-1 md:group-data-[sidebar=collapsed]/shell:not-first:border-t md:group-data-[sidebar=collapsed]/shell:not-first:border-sidebar-border md:group-data-[sidebar=collapsed]/shell:not-first:pt-3">
          <p className="px-3 pb-1 text-xs font-medium text-sidebar-foreground/50 md:group-data-[sidebar=collapsed]/shell:sr-only">{g.title}</p>
          {g.items.map((item) => {
            const link = ({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }, nested: boolean) => {
              const active = href === current;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm md:group-data-[sidebar=collapsed]/shell:justify-center transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none ${nested ? "ml-4 md:group-data-[sidebar=collapsed]/shell:ml-0" : ""} ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}
                >
                  {active ? <span aria-hidden className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" /> : null}
                  <Icon className={`size-4 ${active ? "text-sidebar-primary" : ""}`} aria-hidden />
                  <span className="md:group-data-[sidebar=collapsed]/shell:sr-only">{label}</span>
                </Link>
              );
            };
            if (!item.children) return link(item, false);
            const open = item.children.some((c) => c.href === current);
            const Icon = item.icon;
            return (
              <div key={item.href} className="flex flex-col gap-1">
                <p className={`flex items-center gap-3 px-3 py-2 text-sm font-medium md:group-data-[sidebar=collapsed]/shell:hidden ${open ? "text-sidebar-foreground" : "text-sidebar-foreground/75"}`}>
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </p>
                {item.children.map((c) => link(c, true))}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
