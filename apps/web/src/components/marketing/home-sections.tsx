import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Box, Plus } from "lucide-react";
import { DielineNet, PackBox } from "@/components/studio/pack-box";
import { featureSpans, type HomeContent } from "@/lib/site-content";
import type { PublicTemplate } from "@/server/templates-public";
import { FeaturePicture } from "./feature-visuals";
import { Reveal } from "./reveal";
import { RowScroller } from "./row-scroller";
import { Spotlight } from "./spotlight";

const wrap = "mx-auto w-full max-w-7xl px-4 sm:px-6";

/** Heading of a section: a big title and one line under it. */
function Heading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  if (!title && !subtitle) return null;
  return (
    <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        {title ? <h2 className="font-display text-3xl leading-[1.08] font-bold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">{title}</h2> : null}
        {subtitle ? <p className="mt-3 text-base text-muted-foreground sm:text-lg">{subtitle}</p> : null}
      </div>
      {action}
    </Reveal>
  );
}

/** The kraft tape of short words that runs across the page. The list is printed twice so the loop has no seam. */
export function Tape({ words }: { words: string[] }) {
  if (!words.length) return null;
  const run = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {words.map((w, i) => (
        <li key={`${w}-${i}`} className="flex items-center gap-6 pr-6 font-mono text-sm font-medium whitespace-nowrap text-[var(--ink)] sm:text-base">
          <span>{w}</span>
          <Box className="size-4 opacity-55" aria-hidden />
        </li>
      ))}
    </ul>
  );
  // Short lists are repeated, so the band is always wider than the screen.
  const times = Math.max(2, Math.ceil(24 / words.length));
  return (
    <section aria-label="What you can make" className="relative z-10 -my-2 py-6">
      <div className="tape py-3.5">
        <div className="tape-track">
          {Array.from({ length: times * 2 }, (_, i) => <div key={i} className="flex shrink-0">{run(i > 0)}</div>)}
        </div>
      </div>
    </section>
  );
}

/** A row of real templates: each one a working dieline. */
export function Showcase({ c, templates, total }: { c: HomeContent["showcase"]; templates: PublicTemplate[]; total: number }) {
  if (!templates.length) return null;
  return (
    <section id="templates" className={`${wrap} scroll-mt-24 py-20 sm:py-24`}>
      <Heading
        title={c.title}
        subtitle={c.subtitle}
        action={
          <Link href="/templates" className="group inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:border-[var(--crease)]">
            All {total} templates <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        }
      />
      <Reveal>
        <RowScroller label="Templates">
          {templates.map((t) => (
            <li key={t.id} className="w-[78%] shrink-0 snap-start min-[520px]:w-[46%] lg:w-[31%] xl:w-[23.5%]">
              <Link href={`/template/dieline/${t.id}`} className="sheet marks-hover flap group flex h-full flex-col transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="flap-corner" aria-hidden />
                <span className="paper-grid-soft relative m-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border p-3">
                  {t.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                    <img src={t.thumbnail} alt="" loading="lazy" className="max-h-full max-w-full transition-transform duration-300 group-hover:scale-[1.06]" />
                  ) : null}
                  {t.has3d ? <span className="absolute top-2 left-2 rounded-full bg-[var(--ink)] px-2 py-0.5 font-mono text-[11px] font-medium text-white">3D</span> : null}
                </span>
                <span className="flex items-center justify-between gap-3 px-4 pt-1.5 pb-4">
                  <span className="font-display min-w-0 truncate text-base font-semibold tracking-tight">{t.name}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--cut)]" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </RowScroller>
      </Reveal>
    </section>
  );
}

const SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3"];

/** Feature cards in a grid of three: the first is wide, the last fills its row. Each has a small moving picture. */
export function Features({ c }: { c: HomeContent["features"] }) {
  if (!c.items.length) return null;
  const spans = featureSpans(c.items.length);
  return (
    <section id="features" className={`${wrap} scroll-mt-24 py-20 sm:py-24`}>
      <Heading title={c.title} subtitle={c.subtitle} />
      <Spotlight className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {c.items.map((f, i) => {
          const wide = spans[i]! >= 2;
          const row = spans[i] === 3 && c.items.length > 1;
          return (
            <Reveal key={`${f.title}-${i}`} variant="fold" delay={(i % 3) * 90} className={`${SPAN[spans[i]!]} ${wide && i === 0 ? "sm:col-span-2" : ""} ${row ? "sm:col-span-2" : ""}`}>
              <article className={`sheet bento-card relative flex h-full overflow-hidden ${row ? "flex-col sm:flex-row sm:items-center" : "flex-col"}`}>
                <span className="spot" aria-hidden />
                {f.visual !== "none" ? (
                  <div className={`paper-grid-soft relative m-2 flex items-center justify-center overflow-hidden rounded-lg border p-4 ${row ? "min-h-28 sm:order-2 sm:m-3 sm:flex-1" : wide ? "h-52" : "h-44"}`}>
                    <FeaturePicture visual={f.visual} />
                  </div>
                ) : null}
                <div className={`relative flex flex-col gap-2 p-5 ${row ? "sm:max-w-md sm:flex-1" : ""}`}>
                  <h3 className="font-display text-xl font-semibold tracking-tight">{f.title}</h3>
                  {f.body ? <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p> : null}
                </div>
              </article>
            </Reveal>
          );
        })}
      </Spotlight>
    </section>
  );
}

const STEP_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5", "lg:grid-cols-6"];

/** The steps, in order, strung on a crease line across a dark band. Each panel folds up as it comes into view. */
export function Steps({ c }: { c: HomeContent["steps"] }) {
  if (!c.items.length) return null;
  return (
    <section id="how" className="ink-band scroll-mt-16">
      <div className={`${wrap} py-20 sm:py-28`}>
        {c.title || c.subtitle ? (
          <Reveal className="mb-12 max-w-2xl">
            {c.title ? <h2 className="font-display text-3xl leading-[1.08] font-bold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">{c.title}</h2> : null}
            {c.subtitle ? <p className="mt-3 text-base text-white/70 sm:text-lg">{c.subtitle}</p> : null}
          </Reveal>
        ) : null}
        <ol className={`relative grid gap-x-5 gap-y-10 sm:grid-cols-2 ${STEP_COLS[c.items.length]}`}>
          <span aria-hidden className="absolute top-5 right-0 left-0 hidden border-t-[1.5px] border-dashed border-[var(--crease)]/70 lg:block" />
          {c.items.map((s, i) => (
            <Reveal as="li" key={`${s.title}-${i}`} variant="fold" delay={i * 110} className="relative flex flex-col gap-5">
              <span className="relative z-10 grid size-10 place-items-center rounded-full bg-[var(--cut)] font-mono text-sm font-semibold text-white shadow-[0_0_0_6px_var(--ink)]">{i + 1}</span>
              <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-sm transition-colors duration-300 hover:border-[var(--crease)]/70 hover:bg-white/[0.09]">
                <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
                {s.body ? <p className="text-sm leading-relaxed text-white/70">{s.body}</p> : null}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const TONES = ["var(--cut)", "var(--board-deep)", "var(--crease)", "var(--ink)"];

/** The files a customer can download, as a row of sheets with a folded corner. */
export function Formats({ c }: { c: HomeContent["formats"] }) {
  if (!c.items.length) return null;
  return (
    <section id="formats" className={`${wrap} scroll-mt-24 py-20 sm:py-24`}>
      <Heading title={c.title} subtitle={c.subtitle} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {c.items.map((f, i) => {
          const tone = TONES[i % TONES.length]!;
          return (
            <Reveal as="li" key={`${f.label}-${i}`} variant="fold" delay={(i % 7) * 60}>
              <div className="sheet group relative flex h-full flex-col gap-6 overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-1">
                <span aria-hidden className="absolute top-0 right-0 size-6 transition-all duration-200 group-hover:size-8" style={{ background: `linear-gradient(225deg, var(--paper) 50%, ${tone} 50%)` } as CSSProperties} />
                <span className="font-mono text-2xl font-semibold tracking-tight" style={{ color: tone }}>.{f.label.toLowerCase()}</span>
                <span className="mt-auto text-xs text-muted-foreground">{f.note}</span>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

/** Questions and answers. Each one opens on its own; no script is needed. */
export function Faq({ c }: { c: HomeContent["faq"] }) {
  if (!c.items.length) return null;
  return (
    <section id="faq" className={`${wrap} scroll-mt-24 py-20 sm:py-24`}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-3xl leading-[1.08] font-bold tracking-tight text-balance sm:text-4xl">{c.title}</h2>
          {c.subtitle ? <p className="mt-3 text-base text-muted-foreground">{c.subtitle}</p> : null}
          <DielineNet className="mt-8 hidden h-40 w-auto opacity-40 lg:block" />
        </Reveal>
        <ul className="sheet divide-y divide-dashed divide-[color-mix(in_oklab,var(--crease)_45%,transparent)] overflow-hidden">
          {c.items.map((f, i) => (
            <li key={`${f.q}-${i}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-medium transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-lg tracking-tight">{f.q}</span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border transition-all duration-200 group-open:rotate-45 group-open:border-[var(--cut)] group-open:bg-[var(--cut)] group-open:text-white"><Plus className="size-4" aria-hidden /></span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground sm:px-6 sm:text-base">{f.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The closing band: ink, a light grid, the last button and a box turning. */
export function Cta({ c }: { c: HomeContent["cta"] }) {
  return (
    <section className={`${wrap} pb-20 sm:pb-24`}>
      <Reveal variant="fold">
        <div className="ink-band relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-16">
          <div className="relative max-w-xl">
            <h2 className="font-display text-3xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">{c.title}</h2>
            {c.subtitle ? <p className="mt-4 text-base text-white/75 sm:text-lg">{c.subtitle}</p> : null}
            <Link href={c.button.href} className="group mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-[var(--ink)] shadow-lg transition-shadow hover:shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--cut)] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
              {c.button.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <div className="relative hidden shrink-0 pr-4 md:block">
            <PackBox w={92} h={128} d={64} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
