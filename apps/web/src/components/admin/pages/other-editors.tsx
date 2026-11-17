"use client";

import { useState } from "react";
import { DEFAULT_CONTENT, type ChromeContent, type TemplatesPageContent } from "@/lib/site-content";
import { LinkFields, ListEditor, Panel, SaveBar, TextField, Toggle } from "./fields";

/** The heading of the public Templates page. */
export function TemplatesPageEditor({ initial }: { initial: TemplatesPageContent }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <Panel title="Heading" summary={v.title} defaultOpen>
        <TextField label="Page heading" value={v.title} onChange={(title) => setV({ ...v, title })} max={80} />
        <TextField label="Text under the heading" value={v.subtitle} onChange={(subtitle) => setV({ ...v, subtitle })} max={300} rows={2} />
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">The templates themselves, their order and their categories are under Templates and Categories in the menu.</p>
      </Panel>
      <SaveBar part="templatesPage" value={v} dirty={JSON.stringify(v) !== JSON.stringify(saved)} viewHref="/templates" onSaved={() => setSaved(v)} onReset={() => { setV(DEFAULT_CONTENT.templatesPage); setSaved(DEFAULT_CONTENT.templatesPage); }} />
    </div>
  );
}

/** The parts every public page shares: the announcement bar, the header menu and the footer. */
export function ChromeEditor({ initial }: { initial: ChromeContent }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const a = v.announcement;
  return (
    <div className="flex flex-col gap-3">
      <Panel title="Announcement bar" summary={a.on ? a.text || "On, but empty" : "Off"} defaultOpen>
        <Toggle label="Show the bar" hint="A thin line of text above the menu, on every public page. A visitor can close it." on={a.on} onChange={(on) => setV({ ...v, announcement: { ...a, on } })} />
        <TextField label="Text" value={a.text} onChange={(text) => setV({ ...v, announcement: { ...a, text } })} max={140} />
        <LinkFields legend="Link after the text" optional value={a.link} onChange={(link) => setV({ ...v, announcement: { ...a, link } })} />
      </Panel>

      <Panel title="Header menu" summary={v.nav.map((n) => n.label).join(" · ")}>
        <ListEditor
          items={v.nav}
          onChange={(nav) => setV({ ...v, nav })}
          make={() => ({ label: "", href: "/" })}
          max={6}
          noun="menu link"
          title={(it) => it.label}
          render={(it, up) => <LinkFields legend="Link" value={it} onChange={up} />}
        />
      </Panel>

      <Panel title="Footer" summary={`${v.footer.columns.length} columns`}>
        <TextField label="Short text under the logo" value={v.footer.tagline} onChange={(tagline) => setV({ ...v, footer: { ...v.footer, tagline } })} max={200} rows={2} />
        <ListEditor
          items={v.footer.columns}
          onChange={(columns) => setV({ ...v, footer: { ...v.footer, columns } })}
          make={() => ({ title: "", links: [] })}
          max={4}
          noun="column"
          title={(it) => it.title}
          render={(col, up) => (
            <>
              <TextField label="Column heading" value={col.title} onChange={(title) => up({ ...col, title })} max={40} />
              <ListEditor
                items={col.links}
                onChange={(links) => up({ ...col, links })}
                make={() => ({ label: "", href: "/" })}
                max={8}
                noun="link"
                title={(it) => it.label}
                render={(it, upLink) => <LinkFields legend="Link" value={it} onChange={upLink} />}
              />
            </>
          )}
        />
        <TextField label="Small line at the very bottom" value={v.footer.note} onChange={(note) => setV({ ...v, footer: { ...v.footer, note } })} max={160} hint="For example a copyright line. Leave empty to hide it." />
      </Panel>

      <SaveBar part="chrome" value={v} dirty={JSON.stringify(v) !== JSON.stringify(saved)} viewHref="/" onSaved={() => setSaved(v)} onReset={() => { setV(DEFAULT_CONTENT.chrome); setSaved(DEFAULT_CONTENT.chrome); }} />
    </div>
  );
}
