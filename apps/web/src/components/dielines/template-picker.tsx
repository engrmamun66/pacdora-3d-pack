"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { loadTemplatePicker } from "@/app/(site)/templates/picker-actions";
import type { PublicCategory, PublicTemplate } from "@/server/templates-public";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; templates: PublicTemplate[]; categories: PublicCategory[] };

/**
 * "Dielines" tab: pick another dieline. Opening one starts from its own page, so the settings
 * typed here are not carried over; in edit mode this does not change the project.
 */
export function TemplatePicker({ currentId, mode }: { currentId: string; mode: "create" | "edit" }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    let alive = true;
    loadTemplatePicker()
      .then((r) => alive && setState({ status: "ready", ...r }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (state.status !== "ready") return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return state.templates.filter((t) => (!cat || t.categoryKeys.includes(cat)) && words.every((w) => `${t.name} ${t.description}`.toLowerCase().includes(w)));
  }, [state, q, cat]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Dielines</h2>
        <p className="text-xs text-muted-foreground">
          {mode === "edit" ? "Start a new project from another dieline. This project stays as it is." : "Switch to another dieline. Your size and material settings start over."}
        </p>
      </div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dielines"
          aria-label="Search dielines"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      {state.status === "ready" && state.categories.length ? (
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">All categories ({state.templates.length})</option>
          {state.categories.map((c) => (
            <option key={c.key} value={c.key}>{c.name} ({c.count})</option>
          ))}
        </select>
      ) : null}

      {state.status === "loading" ? <div className="grid grid-cols-2 gap-3" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}</div> : null}
      {state.status === "error" ? <p role="alert" className="text-sm text-destructive">Could not load the dielines. Please try again.</p> : null}
      {state.status === "ready" && shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No dielines match.</p> : null}
      {state.status === "ready" && shown.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {shown.map((t) => {
            const current = t.id === currentId && mode === "create";
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => router.push(`/template/dieline/${t.id}`)}
                  className={`group flex w-full flex-col gap-1.5 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
                >
                  <span className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-2 transition ${current ? "border-primary ring-1 ring-primary" : "group-hover:border-foreground/40"}`}>
                    {t.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                      <img src={t.thumbnail} alt="" className="size-full object-contain" />
                    ) : null}
                  </span>
                  <span className={`px-0.5 text-xs leading-snug ${current ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>{t.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
