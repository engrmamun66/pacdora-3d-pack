import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Box, Check, Download, Ruler } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { env } from "@/server/env";
import { templateMetadata } from "@/server/seo-meta";
import { getPublicCatalogue } from "@/server/templates-public";

async function find(slug: string) {
  const { templates, categories } = await getPublicCatalogue();
  const t = templates.find((x) => x.id === slug);
  return t ? { t, templates, categories } : null;
}

/** Title, description and link preview come from the template's own name and description, inside the pattern of Settings > SEO. */
export async function generateMetadata({ params }: PageProps<"/dielines/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = slug.length <= 80 ? await find(slug) : null;
  return found ? templateMetadata(found.t) : { title: "Dieline template", robots: { index: false } };
}

export default function DielineLandingPage({ params }: PageProps<"/dielines/[slug]">) {
  return (
    <Suspense fallback={<div className="grid gap-6 md:grid-cols-2"><div className="paper-grid sheet aspect-[4/3] animate-pulse" /><div className="sheet h-72 animate-pulse" /></div>}>
      <Landing params={params} />
    </Suspense>
  );
}

/**
 * /dielines/{template}: a public page for one template, so people searching for that box style can find it. It says what the
 * template is, what they get, and leads to the editor (a free account is needed to open it).
 */
async function Landing({ params }: { params: PageProps<"/dielines/[slug]">["params"] }) {
  const { slug } = await params;
  const found = slug.length <= 80 ? await find(slug) : null;
  if (!found) notFound();
  const { t, templates, categories } = found;
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  const cat = categories.find((c) => c.kind === "use" && t.categoryKeys.includes(c.key));
  const related = templates.filter((x) => x.id !== t.id && (cat ? x.categoryKeys.includes(cat.key) : true)).slice(0, 4);
  const facts = [
    { icon: Ruler, text: "Type your own width, depth and height: the whole dieline is calculated again." },
    { icon: Check, text: "Cut, crease, glue and bleed lines on separate layers." },
    ...(t.has3d ? [{ icon: Box, text: "Fold it in 3D and turn it around with your artwork on the panels." }] : []),
    { icon: Download, text: "Export print-ready PDF, AI, EPS, SVG or DXF files." },
  ];
  return (
    <div className="flex flex-col gap-10">
      <JsonLd data={breadcrumbJsonLd(origin, [{ name: "Home", path: "/" }, { name: "Dielines", path: "/dielines" }, { name: t.name, path: `/dielines/${t.id}` }])} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-foreground hover:underline">Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/dielines" className="hover:text-foreground hover:underline">Dielines</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-foreground">{t.name}</li>
        </ol>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="paper-grid sheet marks flex aspect-[4/3] overflow-hidden">
          <div className={`flex items-center justify-center p-6 ${t.productImage ? "basis-[62%]" : "basis-full"}`}>
            {t.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
              <img src={t.thumbnail} alt={`${t.name} dieline template`} className="max-h-full max-w-full" />
            ) : null}
          </div>
          {t.productImage ? (
            <div className="basis-[38%] overflow-hidden bg-[#f4f4f2]">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored PNG, served by our own route */}
              <img src={t.productImage} alt={`${t.name}, folded in 3D`} className="size-full object-cover" />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <h1 className="text-4xl leading-[1.05] sm:text-5xl">{t.name} dieline template</h1>
          {t.description ? <p className="text-lg text-muted-foreground">{t.description}</p> : null}
          <ul className="flex flex-col gap-3">
            {facts.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm sm:text-base">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--cut,#e0227a)]/10 text-[var(--cut,#e0227a)]"><Icon className="size-4" aria-hidden /></span>
                {text}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href={`/template/dieline/${t.id}`} className="cta group inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold">
              Open this dieline <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/dielines" className="inline-flex h-12 items-center rounded-xl border bg-card px-6 text-base font-medium transition-colors hover:border-[var(--crease,currentColor)]">All dielines</Link>
          </div>
          <p className="text-sm text-muted-foreground">Free account, no card. You will be asked to sign in or create an account before the editor opens.</p>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related" className="flex flex-col gap-4">
          <h2 id="related" className="font-display text-2xl font-bold tracking-tight">{cat ? `More ${cat.name.toLowerCase()} dielines` : "More dieline templates"}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/dielines/${r.id}`} className="sheet marks-hover group flex h-full flex-col transition-transform duration-200 hover:-translate-y-1">
                  <span className="paper-grid-soft m-2 flex aspect-[4/3] items-center justify-center rounded-lg border p-3">
                    {r.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                      <img src={r.thumbnail} alt={`${r.name} dieline template`} loading="lazy" className="max-h-full max-w-full" />
                    ) : null}
                  </span>
                  <span className="font-display px-4 pt-1.5 pb-4 text-base font-semibold tracking-tight">{r.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
