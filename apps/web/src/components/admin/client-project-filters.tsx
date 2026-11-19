"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/ui/search-select";

export interface ProjectFilters {
  q: string;
  /** Part of the ID of the template the project was made from. */
  tid: string;
  template: string;
  from: string;
  to: string;
  img: string;
  sort: string;
  dir: string;
}

const SEARCH_DELAY_MS = 400;
const field = "h-9 rounded-lg border border-input bg-card px-2.5 text-sm";

/**
 * The filter bar of the client projects list. There is no Apply button: a choice applies at once, and typing in the search
 * box applies when the typing pauses (debounced). Every change goes into the page address and starts again at page 1.
 */
export function ClientProjectFilters({ values, sorts, templates, changed }: { values: ProjectFilters; sorts: Record<string, string>; templates: { id: string; name: string }[]; changed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q);
  const [tid, setTid] = useState(values.tid);
  const timer = useRef<number | null>(null);
  // Bumping this remounts the date picker, so it forgets the days it was showing.
  const [pickerKey, setPickerKey] = useState(0);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const go = (over: Partial<ProjectFilters>) => {
    if (timer.current) window.clearTimeout(timer.current); // a choice made now replaces any typing still waiting
    const next = { ...values, q, tid, ...over };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    start(() => router.replace(`/doraadmin/users/templates${params.size ? `?${params}` : ""}`));
  };

  /** Back to the plain list: the search box, the date range and every choice are emptied. */
  const clearAll = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setQ("");
    setTid("");
    setPickerKey((k) => k + 1);
    start(() => router.replace("/doraadmin/users/templates"));
  };

  return (
    <form className="flex flex-wrap items-end gap-2" role="search" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim(), tid: tid.trim() }); }}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="q">Search</label>
        <input
          id="q"
          name="q"
          value={q}
          maxLength={100}
          placeholder="Design, client name or email"
          className={`${field} w-64`}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => go({ q: v.trim(), tid: tid.trim() }), SEARCH_DELAY_MS);
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="tid">Parent Template ID</label>
        <input
          id="tid"
          name="tid"
          value={tid}
          maxLength={80}
          placeholder="e.g. regular-slotted-shipping-box"
          className={`${field} w-56 font-mono`}
          onChange={(e) => {
            const v = e.target.value;
            setTid(v);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => go({ tid: v.trim(), q: q.trim() }), SEARCH_DELAY_MS);
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="template">Made from</label>
        <SearchSelect
          id="template"
          className="w-64"
          value={values.template}
          placeholder="Any template"
          emptyText="No template matches."
          options={templates.map((t) => ({ value: t.id, label: t.name, hint: t.id }))}
          onChange={(v) => go({ template: v })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Created between</span>
        <DateRangePicker key={`${pickerKey}-${values.from}-${values.to}`} fromName="from" toName="to" from={values.from} to={values.to} label="Created between" onChange={(from, to) => go({ from, to })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="img">Images</label>
        <select id="img" value={values.img} className={field} onChange={(e) => go({ img: e.target.value })}>
          <option value="">Any</option>
          <option value="with">With images</option>
          <option value="none">No images</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="sort">Sort by</label>
        <select id="sort" value={values.sort} className={field} onChange={(e) => go({ sort: e.target.value, dir: "" })}>
          {Object.entries(sorts).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="dir">Order</label>
        <select id="dir" value={values.dir} className={field} onChange={(e) => go({ dir: e.target.value })}>
          <option value="asc">Ascending (A–Z, oldest, fewest)</option>
          <option value="desc">Descending (Z–A, newest, most)</option>
        </select>
      </div>
      <div className="flex h-9 items-center gap-2" aria-live="polite">
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating the list" /> : null}
        {changed || q || tid ? <button type="button" onClick={clearAll} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Clear all</button> : null}
      </div>
    </form>
  );
}
