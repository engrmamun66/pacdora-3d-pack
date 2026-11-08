"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface LibraryItem {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  tags: string[];
  thumbnail: string | null;
}

/** Searchable, filterable template grid (catalogue is small, so filtering is client-side). */
export function TemplateLibrary({ items, categories }: { items: LibraryItem[]; categories: { id: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((t) => {
      if (cat && t.category !== cat) return false;
      const hay = `${t.name} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q, cat]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" aria-label="Search templates" />
        <div className="flex flex-wrap gap-2">
          <Chip active={cat === null} onClick={() => setCat(null)}>All ({items.length})</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label} ({items.filter((i) => i.category === c.id).length})
            </Chip>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates match.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link href={`/templates/${t.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border transition hover:shadow-sm">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-4">
                  {t.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                    <img src={t.thumbnail} alt="" className="max-h-full max-w-full" />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-medium">{t.name}</h2>
                    <Badge variant="secondary">{t.categoryLabel}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
