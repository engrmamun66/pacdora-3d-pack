import Link from "next/link";
import { Suspense } from "react";
import { Box, Download, Layers, Ruler, Sparkles, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { HeroCarton } from "@/components/marketing/hero-carton";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteTitle } from "@/components/site-brand";
import { site } from "@/config/site";
import { DEFAULT_BOX_COLOR, luminance } from "@/lib/hero-settings";
import { getHeroSettings } from "@/server/site-settings";

const features = [
  { icon: Ruler, title: "Exact dielines", body: "Enter width, depth and height. Cut, crease, glue, bleed and safe areas are calculated by rule, not drawn by hand." },
  { icon: Layers, title: "2D artwork", body: "Place text, logos and shapes on individual panels of the flat dieline, with guides, undo and alignment." },
  { icon: Box, title: "3D preview", body: "Watch the carton fold up with your artwork on the right faces, and turn it around." },
  { icon: Sparkles, title: "Describe a box", body: "Type what you need. The AI only suggests a template and sizes; the geometry engine checks every number." },
  { icon: Download, title: "Print files", body: "PDF, Illustrator, EPS, SVG and DXF with separate cut and crease layers and named spot colours." },
  { icon: ShieldCheck, title: "Checked geometry", body: "Every dieline passes automatic checks: closed cut path, no overlaps, folds that close without collisions." },
];

const steps = [
  { n: "1", title: "Pick a structure", body: "Start from a standard carton or shipping box: tuck end, crash-lock bottom or regular slotted." },
  { n: "2", title: "Set size and board", body: "Give dimensions in mm or inches and choose the board. The sheet and the 3D box update as you type." },
  { n: "3", title: "Add artwork", body: "Design on the flat sheet. Panels, bleed and safe areas stay in view." },
  { n: "4", title: "Export for production", body: "Download print-ready files for your printer or cutting table." },
];

const formats = ["PDF", "AI", "EPS", "SVG", "DXF", "PNG", "GLB"];

/** Header and hero share one wrapper so the chosen background colour (and the light or dark text that goes with it) covers both. */
async function HomeTop() {
  const hero = await getHeroSettings();
  const dark = hero.background !== null && luminance(hero.background) < 0.4;
  const panelDark = hero.boxBackground !== null && luminance(hero.boxBackground) < 0.4;
  return (
    <div className={`relative text-foreground ${dark ? "dark" : ""}`} style={hero.background ? { background: hero.background } : undefined}>
      <SiteHeader />
        {/* Hero: fills the screen */}
        <section className={`relative isolate flex min-h-dvh items-center overflow-hidden pt-16 ${hero.background ? "" : "bg-[radial-gradient(60%_50%_at_75%_40%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)]"}`}>
          <div aria-hidden className="hero-grid-mask"><div className="hero-grid" /></div>
          <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col items-start gap-6">
              <p className="rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                Parametric packaging design
              </p>
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Packaging dielines that fold the way you designed them.
              </h1>
              <p className="max-w-lg text-lg text-muted-foreground">{site.tagline}</p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink size="lg" href="/register">Create a free account</ButtonLink>
                <ButtonLink size="lg" variant="outline" href="/templates">Browse templates</ButtonLink>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <li>Cut and crease layers</li>
                <li>Live 3D fold</li>
                <li>Print-ready exports</li>
              </ul>
            </div>

            <div
              className={`relative order-first mx-auto aspect-[5/4] w-full max-w-[640px] sm:aspect-square lg:order-none lg:aspect-[4/5] ${hero.boxBackground ? `rounded-3xl text-foreground ${panelDark ? "dark" : ""}` : ""}`}
              style={hero.boxBackground ? { background: hero.boxBackground } : undefined}
              role="img"
              aria-label="A carton box unfolding into its flat dieline and folding shut again, in a loop"
            >
              <HeroCarton initial={hero.initial} color={hero.boxColor ?? DEFAULT_BOX_COLOR} />
              <p className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-xs text-muted-foreground">
                Generated live by the same engine you will use. Drag to turn it.
              </p>
            </div>
          </div>
        </section>

    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* The hero reads cached site settings; the fallback keeps the page shell instant while it resolves. */}
      <Suspense fallback={<div className="min-h-dvh" aria-hidden />}>
        <HomeTop />
      </Suspense>

      <main className="flex flex-1 flex-col">
        <section id="features" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
          <h2 className="mb-2 text-3xl font-semibold tracking-tight">Everything from sheet to shipment</h2>
          <p className="mb-10 max-w-2xl text-muted-foreground">One workspace for the dieline, the artwork, the 3D box and the files your printer needs.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border p-5">
                <Icon className="mb-3 size-5 text-primary" aria-hidden />
                <h3 className="mb-1 font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y bg-muted/30">
          <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
            <h2 className="mb-10 text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li key={s.n} className="flex flex-col gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{s.n}</span>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="formats" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
          <h2 className="mb-2 text-3xl font-semibold tracking-tight">Files your printer can use</h2>
          <p className="mb-6 max-w-2xl text-muted-foreground">
            Illustrator and EPS files target the version you pick. They have not yet been opened in every real Illustrator release, and the export dialog says so.
          </p>
          <ul className="flex flex-wrap gap-2">
            {formats.map((f) => (
              <li key={f} className="rounded-lg border px-4 py-2 text-sm font-medium">{f}</li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-primary px-8 py-12 text-primary-foreground">
            <h2 className="text-3xl font-semibold tracking-tight">Make your first dieline in a minute</h2>
            <p className="max-w-xl opacity-90">Free account, no card. Start from a template and change the size.</p>
            <ButtonLink size="lg" variant="secondary" href="/register">Get started</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <span><Suspense fallback={site.name}><SiteTitle /></Suspense></span>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/templates" className="hover:text-foreground">Templates</Link>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/register" className="hover:text-foreground">Register</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
