"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { PortalCapture } from "@/server/portal";

/** Which design sample of a shared template is open (null = the template as it is now). The grid under the name picks it; the 3D view follows. */
const Ctx = createContext<{ selected: string | null; select: (id: string | null) => void }>({ selected: null, select: () => undefined });

/** `initial`: the sample open when the page loads (the first of the grid), or null for the template as it is. */
export function SampleDesignProvider({ children, initial = null }: { children: ReactNode; initial?: string | null }) {
  const [selected, select] = useState<string | null>(initial);
  return <Ctx.Provider value={{ selected, select }}>{children}</Ctx.Provider>;
}

export const useSampleDesign = () => useContext(Ctx);

/**
 * The design samples the Client kept (3D pictures, shown exactly as taken), as a grid under the template's name.
 * A click opens that sample in the 3D view with the design it was taken with: box size, artwork, backgrounds, colours, layout and fold.
 * A click on the open one goes back to the template as it is.
 */
export function DesignSamples({ captures }: { captures: PortalCapture[] }) {
  const { selected, select } = useSampleDesign();
  if (captures.length === 0) return null;
  return (
    <section aria-label="Design samples" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Design samples</h2>
      <div className="grid grid-cols-3 gap-2">
        {captures.map((c, i) => {
          const on = c.id === selected;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              title={`Design sample ${captures.length - i}: show it in 3D`}
              onClick={() => select(on ? null : c.id)}
              className={`relative block aspect-[4/3] overflow-hidden rounded-lg border bg-card shadow-xs transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${on ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-background" : "hover:-translate-y-0.5 hover:shadow-md"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the saved picture, exactly as the Client took it */}
              <img src={c.url} alt={`Design sample ${captures.length - i}`} loading="lazy" className="size-full object-cover" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
