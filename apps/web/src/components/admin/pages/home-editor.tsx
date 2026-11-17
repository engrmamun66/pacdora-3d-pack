"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DEFAULT_CONTENT, FEATURE_VISUALS, HOME_SECTIONS, type FeatureVisual, type HomeContent } from "@/lib/site-content";
import { LinkFields, ListEditor, Panel, SaveBar, StringList, TextField, Toggle } from "./fields";

const selectCls = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Everything on the home page under an admin's control: the hero words, which sections show and in what order, and each section's content. */
export function HomeEditor({ initial }: { initial: HomeContent }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const set = <K extends keyof HomeContent>(k: K, part: HomeContent[K]) => setV((s) => ({ ...s, [k]: part }));
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const label = (id: string) => HOME_SECTIONS.find((s) => s.id === id)!;
  const moveSection = (i: number, d: -1 | 1) => {
    const next = v.sections.slice();
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it!);
    set("sections", next);
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Hero" summary={v.hero.title} defaultOpen>
        <TextField label="Small label above the headline" value={v.hero.badge} onChange={(badge) => set("hero", { ...v.hero, badge })} max={80} hint="Leave empty to hide it." />
        <TextField label="Headline" value={v.hero.title} onChange={(title) => set("hero", { ...v.hero, title })} max={140} rows={2} />
        <TextField label="Text under the headline" value={v.hero.subtitle} onChange={(subtitle) => set("hero", { ...v.hero, subtitle })} max={300} rows={2} />
        <LinkFields legend="Main button" value={v.hero.primary} onChange={(primary) => set("hero", { ...v.hero, primary })} />
        <LinkFields legend="Second button" optional value={v.hero.secondary} onChange={(secondary) => set("hero", { ...v.hero, secondary })} />
        <StringList label="Short points under the buttons" items={v.hero.points} onChange={(points) => set("hero", { ...v.hero, points })} max={5} maxLength={60} noun="point" />
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">The moving box, its start position and the hero colours are under <Link href="/doraadmin/settings" className="font-medium text-foreground underline underline-offset-2">Settings &gt; Home page</Link>.</p>
      </Panel>

      <Panel title="Sections and their order" summary={`${v.sections.filter((s) => s.on).length} of ${v.sections.length} shown`}>
        <p className="text-sm text-muted-foreground">The hero is always first. Switch a section off to hide it, and use the arrows to change the order.</p>
        <ul className="flex flex-col gap-1.5">
          {v.sections.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Toggle label={label(s.id).label} hint={label(s.id).hint} on={s.on} onChange={(on) => set("sections", v.sections.map((x) => (x.id === s.id ? { ...x, on } : x)))} />
              </div>
              <button type="button" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label={`Move ${label(s.id).label} up`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" disabled={i === v.sections.length - 1} onClick={() => moveSection(i, 1)} aria-label={`Move ${label(s.id).label} down`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Moving tape" summary={v.tape.join(" · ")}>
        <StringList label="Words on the tape" items={v.tape} onChange={(tape) => set("tape", tape)} max={16} maxLength={30} noun="word" />
      </Panel>

      <Panel title="Template showcase" summary={v.showcase.title}>
        <TextField label="Heading" value={v.showcase.title} onChange={(title) => set("showcase", { ...v.showcase, title })} max={100} />
        <TextField label="Text under the heading" value={v.showcase.subtitle} onChange={(subtitle) => set("showcase", { ...v.showcase, subtitle })} max={300} rows={2} />
        <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
          How many templates to show
          <input type="number" min={3} max={16} value={v.showcase.count} onChange={(e) => set("showcase", { ...v.showcase, count: Math.max(3, Math.min(16, Math.round(Number(e.target.value)) || 3)) })} className={selectCls} />
          <span className="text-xs font-normal text-muted-foreground">The first published templates, in the order of the Templates list (3 to 16).</span>
        </label>
      </Panel>

      <Panel title="Features" summary={`${v.features.items.length} cards`}>
        <TextField label="Heading" value={v.features.title} onChange={(title) => set("features", { ...v.features, title })} max={100} />
        <TextField label="Text under the heading" value={v.features.subtitle} onChange={(subtitle) => set("features", { ...v.features, subtitle })} max={300} rows={2} />
        <ListEditor
          items={v.features.items}
          onChange={(items) => set("features", { ...v.features, items })}
          make={() => ({ title: "", body: "", visual: "none" as FeatureVisual })}
          max={9}
          noun="card"
          title={(it) => it.title}
          render={(it, up) => (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <TextField label="Title" value={it.title} onChange={(title) => up({ ...it, title })} max={60} />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Moving picture
                  <select value={it.visual} onChange={(e) => up({ ...it, visual: e.target.value as FeatureVisual })} className={selectCls}>
                    {FEATURE_VISUALS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
              </div>
              <TextField label="Text" value={it.body} onChange={(body) => up({ ...it, body })} max={300} rows={2} />
            </>
          )}
        />
      </Panel>

      <Panel title="How it works" summary={`${v.steps.items.length} steps`}>
        <TextField label="Heading" value={v.steps.title} onChange={(title) => set("steps", { ...v.steps, title })} max={100} />
        <TextField label="Text under the heading" value={v.steps.subtitle} onChange={(subtitle) => set("steps", { ...v.steps, subtitle })} max={300} rows={2} />
        <ListEditor
          items={v.steps.items}
          onChange={(items) => set("steps", { ...v.steps, items })}
          make={() => ({ title: "", body: "" })}
          max={6}
          noun="step"
          title={(it) => it.title}
          render={(it, up) => (
            <>
              <TextField label="Title" value={it.title} onChange={(title) => up({ ...it, title })} max={60} />
              <TextField label="Text" value={it.body} onChange={(body) => up({ ...it, body })} max={300} rows={2} />
            </>
          )}
        />
      </Panel>

      <Panel title="File formats" summary={v.formats.items.map((f) => f.label).join(", ")}>
        <TextField label="Heading" value={v.formats.title} onChange={(title) => set("formats", { ...v.formats, title })} max={100} />
        <TextField label="Text under the heading" value={v.formats.subtitle} onChange={(subtitle) => set("formats", { ...v.formats, subtitle })} max={400} rows={3} />
        <ListEditor
          items={v.formats.items}
          onChange={(items) => set("formats", { ...v.formats, items })}
          make={() => ({ label: "", note: "" })}
          max={12}
          noun="format"
          title={(it) => it.label}
          render={(it, up) => (
            <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <TextField label="Name" value={it.label} onChange={(l) => up({ ...it, label: l })} max={12} />
              <TextField label="What it is for" value={it.note} onChange={(note) => up({ ...it, note })} max={80} />
            </div>
          )}
        />
      </Panel>

      <Panel title="Questions" summary={`${v.faq.items.length} questions`}>
        <TextField label="Heading" value={v.faq.title} onChange={(title) => set("faq", { ...v.faq, title })} max={100} />
        <TextField label="Text under the heading" value={v.faq.subtitle} onChange={(subtitle) => set("faq", { ...v.faq, subtitle })} max={300} rows={2} />
        <ListEditor
          items={v.faq.items}
          onChange={(items) => set("faq", { ...v.faq, items })}
          make={() => ({ q: "", a: "" })}
          max={14}
          noun="question"
          title={(it) => it.q}
          render={(it, up) => (
            <>
              <TextField label="Question" value={it.q} onChange={(q) => up({ ...it, q })} max={160} />
              <TextField label="Answer" value={it.a} onChange={(a) => up({ ...it, a })} max={700} rows={3} />
            </>
          )}
        />
      </Panel>

      <Panel title="Closing call" summary={v.cta.title}>
        <TextField label="Heading" value={v.cta.title} onChange={(title) => set("cta", { ...v.cta, title })} max={100} />
        <TextField label="Text under the heading" value={v.cta.subtitle} onChange={(subtitle) => set("cta", { ...v.cta, subtitle })} max={300} rows={2} />
        <LinkFields legend="Button" value={v.cta.button} onChange={(button) => set("cta", { ...v.cta, button })} />
      </Panel>

      <SaveBar part="home" value={v} dirty={dirty} viewHref="/" onSaved={() => setSaved(v)} onReset={() => { setV(DEFAULT_CONTENT.home); setSaved(DEFAULT_CONTENT.home); }} />
    </div>
  );
}
