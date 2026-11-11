"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { loadMyTemplates, loadTemplatePicker, type MyTemplate } from "@/app/(site)/templates/picker-actions";
import type { PublicCategory, PublicTemplate } from "@/server/templates-public";

type Mine = { status: "idle" } | { status: "loading" } | { status: "error" } | { status: "ready"; items: MyTemplate[] };
type Source = "system" | "mine";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; templates: PublicTemplate[]; categories: PublicCategory[] };

/**
 * "Dielines" tab: pick another dieline. Opening one starts from its own page, so the settings
 * typed here are not carried over; in edit mode this does not change the project.
 */
export function TemplatePicker({ currentId, currentProjectId = null, mode }: { currentId: string; currentProjectId?: string | null; mode: "create" | "edit" }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [source, setSource] = useState<Source>("system");
  const [mine, setMine] = useState<Mine>({ status: "idle" });

  // "My templates" are loaded the first time that tab is opened.
  const openMine = () => {
    setSource("mine");
    if (mine.status !== "idle" && mine.status !== "error") return;
    setMine({ status: "loading" });
    loadMyTemplates()
      .then((items) => setMine({ status: "ready", items }))
      .catch(() => setMine({ status: "error" }));
  };

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

  const myShown = useMemo(() => {
    if (mine.status !== "ready") return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return mine.items.filter((t) => words.every((w) => `${t.name} ${t.templateName}`.toLowerCase().includes(w)));
  }, [mine, q]);

  const tabs: { id: Source; label: string; open: () => void }[] = [
    { id: "system", label: "System templates", open: () => setSource("system") },
    { id: "mine", label: "My templates", open: openMine },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Dielines</h2>
        <p className="text-xs text-muted-foreground">
          {source === "mine"
            ? "Your saved projects. Open one to keep working on it."
            : mode === "edit"
              ? "Start a new project from another dieline. This project stays as it is."
              : "Switch to another dieline. Your size and material settings start over."}
        </p>
      </div>
      <div role="tablist" aria-label="Which dielines" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={source === t.id}
            onClick={t.open}
            className={`rounded-md px-2 py-1.5 transition-colors ${source === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={source === "mine" ? "Search my templates" : "Search dielines"}
          aria-label={source === "mine" ? "Search my templates" : "Search dielines"}
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      {source === "system" && state.status === "ready" && state.categories.length ? (
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">All categories ({state.templates.length})</option>
          {state.categories.map((c) => (
            <option key={c.key} value={c.key}>{c.name} ({c.count})</option>
          ))}
        </select>
      ) : null}

      {source === "system" && state.status === "loading" ? <div className="grid grid-cols-2 gap-3" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}</div> : null}
      {source === "system" && state.status === "error" ? <p role="alert" className="text-sm text-destructive">Could not load the dielines. Please try again.</p> : null}
      {source === "system" && state.status === "ready" && shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No dielines match.</p> : null}
      {source === "system" && state.status === "ready" && shown.length > 0 ? (
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

      {source === "mine" ? (
        <>
          {mine.status === "loading" ? <div className="grid grid-cols-2 gap-3" aria-busy>{[0, 1].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}</div> : null}
          {mine.status === "error" ? <p role="alert" className="text-sm text-destructive">Could not load your templates. Please try again.</p> : null}
          {mine.status === "ready" && mine.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">You have no saved templates yet. Open a dieline and press Design Online to save one.</p> : null}
          {mine.status === "ready" && mine.items.length > 0 && myShown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No templates match.</p> : null}
          {mine.status === "ready" && myShown.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3">
              {myShown.map((t) => {
                const current = t.id === currentProjectId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => router.push(`/projects/${t.id}`)}
                      className="group flex w-full flex-col gap-1.5 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-2 transition ${current ? "border-primary ring-1 ring-primary" : "group-hover:border-foreground/40"}`}>
                        {t.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                          <img src={t.thumbnail} alt="" className="size-full object-contain" />
                        ) : null}
                      </span>
                      <span className={`px-0.5 text-xs leading-snug ${current ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                        <span className="block truncate">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">{t.templateName === t.name ? t.updatedAt : `${t.templateName} · ${t.updatedAt}`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
