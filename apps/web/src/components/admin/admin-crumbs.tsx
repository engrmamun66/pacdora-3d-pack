"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  users: "Clients",
  templates: "Templates",
  "template-categories": "Categories",
  artworks: "Artworks",
  settings: "Settings",
  pages: "Pages",
  profile: "Profile",
};
const LAST: Record<string, string> = { new: "Add template", edit: "Edit", templates: "Client Templates", orders: "Client Orders", customers: "Client Customers", "header-footer": "Header and footer" };
/** Last parts that mean something else under Pages. */
const PAGES_LAST: Record<string, string> = { templates: "Templates page", "header-footer": "Header and footer" };

/** Where you are, in the top bar: Admin / Section / (Add template | Edit). */
export function AdminCrumbs() {
  const parts = usePathname().replace(/^\/doraadmin\/?/, "").split("/").filter(Boolean);
  const section = parts[0];
  const last = parts.at(-1);
  const trail = [
    { label: "Admin", href: "/doraadmin" },
    ...(section && LABELS[section] ? [{ label: LABELS[section], href: `/doraadmin/${section}` }] : []),
    ...(section === "pages" && parts.length > 1 && last && PAGES_LAST[last] ? [{ label: PAGES_LAST[last], href: null }] : parts.length > 1 && last && LAST[last] ? [{ label: LAST[last], href: null }] : section === "users" && parts.length === 2 ? [{ label: "Client details", href: null }] : []),
  ];
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm">
        {trail.map((c, i) => {
          const current = i === trail.length - 1;
          return (
            <li key={c.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
              {current || !c.href ? (
                <span aria-current={current ? "page" : undefined} className="truncate font-medium">{c.label}</span>
              ) : (
                <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
