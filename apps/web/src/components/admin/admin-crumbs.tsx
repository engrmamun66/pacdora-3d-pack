"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  users: "Users",
  templates: "Templates",
  "template-categories": "Categories",
  settings: "Settings",
  profile: "Profile",
};
const LAST: Record<string, string> = { new: "Add template", edit: "Edit" };

/** Where you are, in the top bar: Admin / Section / (Add template | Edit). */
export function AdminCrumbs() {
  const parts = usePathname().replace(/^\/doraadmin\/?/, "").split("/").filter(Boolean);
  const section = parts[0];
  const last = parts.at(-1);
  const trail = [
    { label: "Admin", href: "/doraadmin" },
    ...(section && LABELS[section] ? [{ label: LABELS[section], href: `/doraadmin/${section}` }] : []),
    ...(parts.length > 1 && last && LAST[last] ? [{ label: LAST[last], href: null }] : []),
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
