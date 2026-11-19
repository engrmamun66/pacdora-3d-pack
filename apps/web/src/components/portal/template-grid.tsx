"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Search, ShoppingCart } from "lucide-react";
import { notify } from "@/lib/notify";
import { portalTemplate } from "@/lib/portal-paths";
import type { CardImage, PortalTemplate } from "@/server/portal";
import { useCart } from "./cart";

/** The templates of a shared page as cards: search, open one, or add it to the cart. */
/** Cards per row on wide screens, as whole class names (Tailwind reads them from the source). */
const COLUMNS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

export function TemplateGrid({ userHash, scopeHash, templates, columns = 4, image = "dieline" }: { userHash: string; scopeHash: string | null; templates: PortalTemplate[]; /** Cards per row (from the Client's Products Settings). */ columns?: number; /** Which picture is on a card. */ image?: CardImage }) {
  const { lines, add } = useCart(userHash);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? templates.filter((t) => t.name.toLowerCase().includes(n) || t.templateName.toLowerCase().includes(n) || (t.category ?? "").toLowerCase().includes(n) || t.tags.some((x) => x.toLowerCase().includes(n))) : templates;
  }, [templates, q]);
  const inCart = new Set(lines.map((l) => l.hash));

  return (
    <div className="flex flex-col gap-4">
      {templates.length > 6 ? (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" maxLength={80} className="sheet h-11 w-full rounded-xl pr-3 pl-10 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      ) : null}
      {shown.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--crease)]/50 bg-card/60 px-4 py-12 text-center text-sm text-muted-foreground">{templates.length === 0 ? "There are no templates here yet." : "No template matches your search."}</p> : null}
      <ul className={`grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 ${COLUMNS[columns] ?? COLUMNS[4]}`}>
        {shown.map((t) => {
          const href = portalTemplate(userHash, scopeHash, t.hash);
          const added = inCart.has(t.hash);
          return (
            <li key={t.hash} className="sheet marks-hover flap group flex flex-col transition-transform duration-200 hover:-translate-y-0.5">
              <span className="flap-corner" aria-hidden />
              <Link href={href} className="paper-grid-soft m-2 flex aspect-[4/3] items-center justify-center rounded-lg border p-3" aria-label={`Open ${t.name}`}>
                {(image === "3d" && t.cover) || t.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL, or the Client's own 3D picture
                  <img src={(image === "3d" && t.cover) || t.thumbnail || ""} alt="" className="max-h-full max-w-full transition-transform duration-300 group-hover:scale-[1.06]" />
                ) : (
                  <span className="text-xs text-muted-foreground">No preview</span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
                <div className="min-w-0">
                  <Link href={href} className="font-display block truncate text-base font-semibold tracking-tight hover:underline">{t.name}</Link>
                  <p className="truncate font-mono text-xs text-muted-foreground">{t.templateName}</p>
                  {t.category || t.tags.length ? (
                    <p className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                      {t.category ? <span className="rounded-full bg-[var(--cut)]/10 px-2 py-0.5 text-[var(--cut)]">{t.category}</span> : null}
                      {t.tags.slice(0, 2).map((x) => <span key={x} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{x}</span>)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    add({ hash: t.hash, name: t.name, thumbnail: t.thumbnail });
                    notify.success(`${t.name} was added to your cart.`, { id: `cart-${t.hash}` });
                  }}
                  className={`mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring ${added ? "border-[var(--crease)]/60 bg-[var(--crease)]/10 text-foreground" : "bg-card hover:bg-[var(--ink)] hover:text-white"}`}
                >
                  {added ? <Check className="size-3.5" aria-hidden /> : <ShoppingCart className="size-3.5" aria-hidden />}
                  {added ? "In cart · add one more" : "Add to cart"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
