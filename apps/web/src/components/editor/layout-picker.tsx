"use client";

import type { LayoutItem } from "@/lib/scene-layout";
import { SamplePlaceholder } from "@/components/portal/template-preview";

/**
 * Right bar of the online design page, under the properties: every layout (how the 3D view arranges the boxes) as a picture card, the same
 * cards the shared pages show as Sample tabs, plus "Default". Click one to show the box that way.
 */
export function LayoutPicker({ layouts, layoutId, onPick }: { layouts: LayoutItem[]; layoutId: string | null; onPick: (id: string | null) => void }) {
  const cards: { id: string | null; name: string; iconUrl: string | null }[] = [{ id: null, name: "Default", iconUrl: null }, ...layouts.map((l) => ({ id: l.id, name: l.name, iconUrl: l.iconUrl ?? null }))];
  return (
    <section aria-label="Layouts of the boxes in the 3D view" className="border-t">
      <h2 className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layouts</h2>
      <div role="radiogroup" aria-label="Layout" className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 px-3 pb-3">
        {cards.map((c) => {
          const on = c.id === layoutId;
          return (
            <button
              key={c.id ?? "one"}
              type="button"
              role="radio"
              aria-checked={on}
              title={c.name}
              onClick={() => onPick(c.id)}
              className="group flex flex-col items-center gap-1 rounded-xl p-0.5 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className={`relative block aspect-square w-full overflow-hidden rounded-xl border bg-card shadow-xs transition-all ${on ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-background" : "group-hover:-translate-y-0.5 group-hover:shadow-md"}`}>
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the layout's icon, a small PNG
                  <img src={c.iconUrl} alt="" className="size-full object-cover" />
                ) : (
                  <SamplePlaceholder />
                )}
              </span>
              <span className={`w-full truncate text-[11px] font-medium ${on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>{c.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
