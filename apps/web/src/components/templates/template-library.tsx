"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PublicCategory, PublicTemplate } from "@/server/templates-public";

/**
 * The template list: categories on the left (with how many templates each has), a grid of
 * dieline pictures on the right with the name underneath. `children` goes above the grid.
 */
export function TemplateLibrary({ items, categories, children }: { items: PublicTemplate[]; categories: PublicCategory[]; children?: ReactNode }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const uses = categories.filter((c) => c.kind === "use");
  const models = categories.filter((c) => c.kind === "model");
  const modelActive = models.some((c) => c.key === cat);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((t) => {
      if (cat && !t.categoryKeys.includes(cat)) return false;
      const hay = `${t.name} ${t.description}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q, cat]);

  const pick = (key: string | null) => setCat(key);

  return (
    <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Wide screens: category list that stays in view while the grid scrolls. */}
      <nav aria-label="Template categories" className="hidden md:block">
        <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-1 overflow-y-auto pr-2">
          <CategoryRow active={cat === null} label="All templates" count={items.length} onClick={() => pick(null)} />
          {uses.length ? <p className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">By uses</p> : null}
          {uses.map((c) => <CategoryRow key={c.key} active={cat === c.key} label={c.name} count={c.count} onClick={() => pick(c.key)} />)}
          {models.length ? (
            <details open={modelActive} className="group mt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
                By models
                <span aria-hidden className="text-base leading-none transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="mt-1 flex flex-col gap-1">
                {models.map((c) => <CategoryRow key={c.key} active={cat === c.key} label={c.name} count={c.count} onClick={() => pick(c.key)} />)}
              </div>
            </details>
          ) : null}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col gap-5">
        {/* Small screens: the same categories as a row you can swipe. */}
        <div role="group" aria-label="Template categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
          <Pill active={cat === null} onClick={() => pick(null)}>All ({items.length})</Pill>
          {[...uses, ...models].map((c) => <Pill key={c.key} active={cat === c.key} onClick={() => pick(c.key)}>{c.name} ({c.count})</Pill>)}
        </div>

        <div className="relative sm:max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search templates" />
        </div>

        {children}

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No templates match.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => (
              <li key={t.id}>
                <Link href={`/template/dieline/${t.id}`} className="group flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <div className="relative flex aspect-[4/3] overflow-hidden rounded-2xl border bg-muted/40 transition group-hover:border-foreground/40 group-hover:shadow-sm">
                    {/* Dieline on the left (60%), the 3D picture an admin saved on the right (40%). Without a picture the dieline fills the card. */}
                    <div className={`flex items-center justify-center p-4 ${t.productImage ? "basis-[60%]" : "basis-full"}`}>
                      {t.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                        <img src={t.thumbnail} alt="" className="size-full object-contain" />
                      ) : null}
                    </div>
                    {t.productImage ? (
                      <div className="basis-[40%] overflow-hidden bg-[#f4f4f2] dark:bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- stored PNG, served by our own route */}
                        <img src={t.productImage} alt={`${t.name}, folded`} className="size-full object-cover" loading="lazy" />
                      </div>
                    ) : null}
                    {t.has3d ? <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90">3D</Badge> : null}
                  </div>
                  <span className="px-1 text-base text-muted-foreground transition-colors group-hover:text-foreground">{t.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${active ? "border-foreground font-medium" : "border-transparent hover:bg-muted"}`}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
