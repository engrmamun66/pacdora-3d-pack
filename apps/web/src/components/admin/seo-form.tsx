"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { resetSeoSettings, saveSeoSettings } from "@/app/doraadmin/actions";
import { DEFAULT_SEO, DESCRIPTION_HINT, SEO_PAGES, TITLE_HINT, fullTitle, withSite, type SeoPageKey, type SeoSettings } from "@/lib/seo-settings";
import { Panel, StringList, TextField, Toggle } from "./pages/fields";

/** A line that says how long a title or description is, against the length search engines usually show. */
function Length({ value, limit }: { value: string; limit: number }) {
  const n = value.length;
  const tone = n === 0 ? "text-muted-foreground" : n > limit ? "text-amber-600 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";
  return <p className={`text-xs tabular-nums ${tone}`}>{n} characters{n > limit ? `, search engines usually cut after ${limit}` : n ? `, fits in ${limit}` : ""}</p>;
}

/** How a result looks in a search engine and in a shared link. */
function Preview({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-4" aria-label="Preview of a search result">
      <p className="text-xs text-muted-foreground">Preview of a search result</p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{url}</p>
      <p className="truncate text-lg text-[#1a0dab] dark:text-sky-400">{title || "(no title)"}</p>
      <p className="line-clamp-2 text-sm text-muted-foreground">{description || "(no description)"}</p>
    </div>
  );
}

/** The SEO settings: site-wide data, one block per public page, structured data, and the codes that prove ownership. */
export function SeoForm({ initial, siteTitle }: { initial: SeoSettings; siteTitle: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = <K extends keyof SeoSettings>(k: K, x: SeoSettings[K]) => setV((s) => ({ ...s, [k]: x }));
  const setPage = (k: SeoPageKey, patch: Partial<SeoSettings["pages"][SeoPageKey]>) => setV((s) => ({ ...s, pages: { ...s.pages, [k]: { ...s.pages[k], ...patch } } }));
  const origin = typeof window === "undefined" ? "https://example.com" : window.location.origin;

  const save = () =>
    start(async () => {
      const r = await saveSeoSettings(v).catch(() => ({ ok: false, message: "Could not save. Check your connection and try again." }));
      if (r.ok) {
        notify.success(r.message, { id: "seo-save" });
        setSaved(v);
        router.refresh();
      } else notify.error(r.message, { id: "seo-save" });
    });
  const reset = () =>
    start(async () => {
      const r = await resetSeoSettings().catch(() => ({ ok: false, message: "Could not restore. Try again." }));
      setConfirming(false);
      if (r.ok) {
        notify.success(r.message, { id: "seo-save" });
        setV(DEFAULT_SEO);
        setSaved(DEFAULT_SEO);
        router.refresh();
      } else notify.error(r.message, { id: "seo-save" });
    });

  const homeTitle = v.pages.home.title ? fullTitle(v.pages.home.title, v, siteTitle) : withSite(v.defaultTitle || "{site}", siteTitle);
  const homeDescription = v.pages.home.description || v.description;

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Whole site" summary={withSite(v.defaultTitle || "{site}", siteTitle)} defaultOpen>
        <Toggle label="Let search engines list this site" hint="Switch off only while the site is not ready: every page then asks search engines to stay away." on={v.indexing} onChange={(on) => set("indexing", on)} />
        {!v.indexing ? <p role="alert" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Search engines are asked to skip the whole site. It will not appear in search results.</p> : null}
        <div className="flex flex-col gap-1.5">
          <TextField label="Title for pages without their own" value={v.defaultTitle} onChange={(x) => set("defaultTitle", x)} max={90} hint="{site} becomes the site name. Start with the phrase people search for." />
          <Length value={withSite(v.defaultTitle, siteTitle)} limit={TITLE_HINT} />
        </div>
        <TextField label="Pattern around a page's own title" value={v.titleTemplate} onChange={(x) => set("titleTemplate", x)} max={90} hint="%s is the page's title, {site} the site name. For example: %s | {site}" mono />
        <div className="flex flex-col gap-1.5">
          <TextField label="Description" value={v.description} onChange={(x) => set("description", x)} max={220} rows={3} hint="One or two sentences that say what people can do here. Used where a page has no description of its own." />
          <Length value={v.description} limit={DESCRIPTION_HINT} />
        </div>
        <StringList label="Keywords" items={v.keywords} onChange={(x) => set("keywords", x)} max={25} maxLength={60} noun="keyword" />
        <p className="text-xs text-muted-foreground">Search engines hardly use the keyword list. The words that matter most are the ones in the titles, descriptions and headings, so use these as your list of phrases to keep in them.</p>
        <Preview title={homeTitle} description={homeDescription} url={`${origin}/`} />
      </Panel>

      {SEO_PAGES.map((p) => {
        const own = v.pages[p.key];
        const shownTitle = p.key === "home" ? homeTitle : fullTitle(own.title || "Page", v, siteTitle);
        return (
          <Panel key={p.key} title={p.label} summary={own.title || (p.key === "home" ? "Uses the whole-site title" : "No title")}>
            <p className="text-sm text-muted-foreground">{p.hint}</p>
            <div className="flex flex-col gap-1.5">
              <TextField label="Title" value={own.title} onChange={(x) => setPage(p.key, { title: x })} max={90} hint={p.key === "home" ? "Empty = the whole-site title above. Written here, it is put into the pattern above." : "The pattern above is put around it."} />
              <Length value={shownTitle} limit={TITLE_HINT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <TextField label="Description" value={own.description} onChange={(x) => setPage(p.key, { description: x })} max={220} rows={3} hint="Empty = the whole-site description." />
              <Length value={own.description || v.description} limit={DESCRIPTION_HINT} />
            </div>
            <Preview title={shownTitle} description={own.description || v.description} url={`${origin}${p.path}`} />
          </Panel>
        );
      })}

      <Panel title="Link previews" summary={v.shareImage ? "Own picture" : "Card the site draws"}>
        <TextField label="Share picture address (optional)" value={v.shareImage} onChange={(x) => set("shareImage", x)} max={300} mono placeholder="https://…/share.png" hint="Shown when a link is posted in chat or on social sites. 1200 × 630 pixels works best. Empty = a card the site draws with its name and tagline." />
        <TextField label="Twitter / X account" value={v.twitter} onChange={(x) => set("twitter", x)} max={40} placeholder="@yourname" hint="Optional." />
        <div className="rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground">Preview the card the site draws: <a className="font-medium text-foreground underline underline-offset-2" href="/opengraph-image" target="_blank" rel="noopener">/opengraph-image</a></div>
      </Panel>

      <Panel title="Structured data" summary={v.structuredData ? "On" : "Off"}>
        <Toggle label="Add structured data to the home page" hint="Data about the company, the web site, the tool and the questions on the page. It helps search engines show richer results." on={v.structuredData} onChange={(on) => set("structuredData", on)} />
        <Toggle label="The tool can be used for free" hint="Says in that data that there is a free offer. Switch off if you charge from the first use." on={v.freeToUse} onChange={(on) => set("freeToUse", on)} />
        <StringList label="Your company's other pages (social profiles, directories)" items={v.sameAs} onChange={(x) => set("sameAs", x)} max={8} maxLength={300} noun="address" />
      </Panel>

      <Panel title="Prove you own the site" summary={v.googleVerification || v.bingVerification ? "Codes set" : "No codes"}>
        <p className="text-sm text-muted-foreground">Search Console tools ask for a code. Paste only the code from the &quot;content&quot; part of the tag they give you.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Google Search Console" value={v.googleVerification} onChange={(x) => set("googleVerification", x)} max={120} mono />
          <TextField label="Bing Webmaster Tools" value={v.bingVerification} onChange={(x) => set("bingVerification", x)} max={120} mono />
        </div>
        <p className="text-xs text-muted-foreground">The list of pages for search engines is at <a className="underline underline-offset-2" href="/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a>. Give that address to both tools.</p>
      </Panel>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        <span role="status" className="text-sm text-muted-foreground">{dirty ? "You have changes that are not saved." : ""}</span>
        <span className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm">Replace all SEO data with the built-in data?</span>
              <Button type="button" variant="destructive" size="sm" onClick={reset} disabled={busy}>Yes, restore</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>Keep mine</Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={busy}><RotateCcw className="size-4" aria-hidden /> Restore built-in data</Button>
          )}
        </span>
      </div>
    </div>
  );
}
