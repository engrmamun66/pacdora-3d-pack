import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { HeroCarton } from "@/components/marketing/hero-carton";
import { Cta, Faq, Features, Formats, Showcase, Steps, Tape } from "@/components/marketing/home-sections";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { DEFAULT_BOX_COLOR, luminance } from "@/lib/hero-settings";
import type { HomeSectionId } from "@/lib/site-content";
import { getSiteContent } from "@/server/site-content";
import { getSeoSettings } from "@/server/seo-settings";
import { getSiteIdentity } from "@/server/site-identity";
import { pageMetadata } from "@/server/seo-meta";
import { env } from "@/server/env";
import { JsonLd } from "@/components/seo/json-ld";
import { homeJsonLd } from "@/lib/structured-data";
import { getHeroSettings, getHeroTemplate } from "@/server/site-settings";
import { getPublicCatalogue } from "@/server/templates-public";

/** Title, description and link preview of the home page: Settings > SEO. */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("home", "/");
}

/** Structured data of the home page (company, web site, tool, and the questions shown on it): Settings > SEO switches it. */
async function HomeStructuredData() {
  const [seo, content, identity] = await Promise.all([getSeoSettings(), getSiteContent(), getSiteIdentity()]);
  if (!seo.structuredData) return null;
  const faqOn = content.home.sections.some((s) => s.id === "faq" && s.on);
  return (
    <JsonLd
      data={homeJsonLd({
        origin: new URL(env.BETTER_AUTH_URL).origin,
        siteName: identity.title,
        description: seo.pages.home.description || seo.description,
        logoUrl: identity.logoUrl,
        sameAs: seo.sameAs,
        freeToUse: seo.freeToUse,
        faq: faqOn ? content.home.faq.items : [],
      })}
    />
  );
}

/**
 * Header and hero share one wrapper so the chosen background colour (and the light or dark text that goes with it)
 * covers both. The words come from Admin > Pages; the box, its colours and where it starts from Settings > Home page.
 */
async function HomeTop() {
  const [hero, content] = await Promise.all([getHeroSettings(), getSiteContent()]);
  const heroTemplate = await getHeroTemplate(hero.templateId);
  const c = content.home.hero;
  const dark = hero.background !== null && luminance(hero.background) < 0.4;
  const panelDark = hero.boxBackground !== null && luminance(hero.boxBackground) < 0.4;
  const words = c.title.split(/\s+/).filter(Boolean);
  const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
  const after = words.length * 55 + 250;
  return (
    <div className={`relative text-foreground ${dark ? "dark" : ""}`} style={hero.background ? { background: hero.background } : undefined}>
      <SiteHeader background={hero.background} />
      {/* Hero: fills the screen */}
      <section className={`relative isolate flex min-h-dvh flex-col overflow-hidden pt-20 ${hero.background ? "" : "bg-[radial-gradient(60%_50%_at_78%_38%,color-mix(in_oklch,var(--crease)_12%,transparent),transparent)]"}`}>
        <div aria-hidden className="hero-grid-mask"><div className="hero-grid" /></div>
        <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="flex flex-col items-start gap-6">
            {c.badge ? (
              <p className="hero-in inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
                <span className="size-1.5 rounded-full bg-[var(--cut)]" aria-hidden />
                {c.badge}
              </p>
            ) : null}
            <h1 aria-label={c.title} className="font-display max-w-2xl text-[2.6rem] leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl xl:text-7xl">
              {words.map((w, i) => (
                <span key={i} aria-hidden>
                  <span className="word-rise"><span style={{ "--i": i } as CSSProperties}>{w}</span></span>{" "}
                </span>
              ))}
            </h1>
            {c.subtitle ? <p className="hero-in max-w-lg text-lg text-muted-foreground sm:text-xl" style={delay(after)}>{c.subtitle}</p> : null}
            <div className="hero-in flex flex-wrap gap-3" style={delay(after + 120)}>
              <Link href={c.primary.href} className="cta group inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {c.primary.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {c.secondary.label && c.secondary.href ? (
                <Link href={c.secondary.href} className="inline-flex h-12 items-center rounded-xl border bg-background/70 px-6 text-base font-medium backdrop-blur transition-colors hover:border-[var(--crease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {c.secondary.label}
                </Link>
              ) : null}
            </div>
            {c.points.length ? (
              <ul className="hero-in flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" style={delay(after + 240)}>
                {c.points.map((p, i) => (
                  <li key={`${p}-${i}`} className="flex items-center gap-2">
                    <span className="w-5 border-t-[1.5px] border-dashed border-[var(--crease)]" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div
            className={`hero-in relative order-first mx-auto aspect-[5/4] w-full max-w-[640px] sm:aspect-square lg:order-none lg:aspect-[4/5] ${hero.boxBackground ? `rounded-3xl text-foreground ${panelDark ? "dark" : ""}` : ""}`}
            style={{ ...delay(200), ...(hero.boxBackground ? { background: hero.boxBackground } : {}) }}
            role="img"
            aria-label="A carton box unfolding into its flat dieline and folding shut again, in a loop"
          >
            <HeroCarton initial={hero.initial} color={hero.boxColor ?? DEFAULT_BOX_COLOR} template={heroTemplate} />
            <p aria-hidden className="live-chip pointer-events-none absolute top-3 right-3 inline-flex items-center gap-2 rounded-full border bg-background/75 px-3 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">
              <span className="live-dot" />
              live 3D
            </p>
            <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center font-mono text-[11px] text-muted-foreground">
              Generated live by the same engine you will use. Drag to turn it.
            </p>
          </div>
        </div>
        <div className="ruler mx-auto w-full max-w-7xl opacity-50" aria-hidden />
      </section>
    </div>
  );
}

/** The sections under the hero, in the order and with the words an admin set under Pages > Home page. */
async function HomeBody() {
  const { home } = await getSiteContent();
  const showcaseOn = home.sections.some((s) => s.id === "showcase" && s.on);
  const catalogue = showcaseOn ? await getPublicCatalogue() : null;
  const section: Record<HomeSectionId, () => React.ReactNode> = {
    tape: () => <Tape words={home.tape} />,
    showcase: () => (catalogue ? <Showcase c={home.showcase} templates={catalogue.templates.slice(0, home.showcase.count)} total={catalogue.templates.length} /> : null),
    features: () => <Features c={home.features} />,
    steps: () => <Steps c={home.steps} />,
    formats: () => <Formats c={home.formats} />,
    faq: () => <Faq c={home.faq} />,
    cta: () => <Cta c={home.cta} />,
  };
  return (
    <main className="flex flex-1 flex-col">
      {home.sections.filter((s) => s.on).map((s) => <div key={s.id} className="contents">{section[s.id]()}</div>)}
    </main>
  );
}

export default function Home() {
  return (
    <div className="studio flex flex-1 flex-col overflow-x-clip">
      <div className="scroll-progress" aria-hidden />
      {/* Sections appear as they scroll into view; without JavaScript they are simply all there. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {/* The hero reads cached site settings; the fallback keeps the page shell instant while it resolves. */}
      <Suspense fallback={<div className="min-h-dvh" aria-hidden />}>
        <HomeTop />
      </Suspense>
      <Suspense fallback={<div className="min-h-96" aria-hidden />}>
        <HomeBody />
      </Suspense>
      <Suspense fallback={null}>
        <HomeStructuredData />
      </Suspense>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}
