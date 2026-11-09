"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PublicCategory, PublicTemplate } from "@/server/templates-public";

type Group = "use" | "model";
const GROUPS: { kind: Group; label: string }[] = [
  { kind: "use", label: "By uses" },
  { kind: "model", label: "By models" },
];

/** Searchable template grid with two browse groups (by uses, by models). "All" means no category filter. */
export function TemplateLibrary({ items, categories }: { items: PublicTemplate[]; categories: PublicCategory[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group>("use");
  const [cat, setCat] = useState<string | null>(null);
  const shown = categories.filter((c) => c.kind === group);
  const byKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((t) => {
      if (cat && !t.categoryKeys.includes(cat)) return false;
      const hay = `${t.name} ${t.description}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q, cat]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" aria-label="Search templates" />
          <div role="tablist" aria-label="Browse by" className="flex rounded-lg border p-0.5 text-sm">
            {GROUPS.map((g) => (
              <button
                key={g.kind}
                type="button"
                role="tab"
                aria-selected={group === g.kind}
                onClick={() => {
                  setGroup(g.kind);
                  setCat(null);
                }}
                className={`rounded-md px-3 py-1 ${group === g.kind ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={cat === null} onClick={() => setCat(null)}>All ({items.length})</Chip>
          {shown.map((c) => (
            <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
              {c.name} ({c.count})
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
              <Link href={`/template/dieline/${t.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border transition hover:shadow-sm">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-4">
                  {t.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                    <img src={t.thumbnail} alt="" className="max-h-full max-w-full" />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <h2 className="font-medium">{t.name}</h2>
                  <div className="flex flex-wrap gap-1">
                    {t.categoryKeys.slice(0, 3).map((k) => (byKey.get(k) ? <Badge key={k} variant="secondary">{byKey.get(k)!.name}</Badge> : null))}
                  </div>
                  {t.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p> : null}
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
