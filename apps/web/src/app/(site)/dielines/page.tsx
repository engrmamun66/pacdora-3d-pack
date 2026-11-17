import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StudioBand } from "@/components/studio/studio-band";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/structured-data";
import { env } from "@/server/env";
import { pageMetadata } from "@/server/seo-meta";
import { getPublicCatalogue, type PublicTemplate } from "@/server/templates-public";

/** Title and description: Settings > SEO. */
export const generateMetadata = () => pageMetadata("dielines", "/dielines");

/**
 * /dielines: the public, crawlable list of dieline templates, grouped by use (gift boxes, shipping boxes ...). Plain server-rendered
 * links, so search engines can follow each one to its own page. People who are signed in open a template in the editor from there.
 */
export default function DielinesPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-8"><div className="paper-grid sheet h-40 animate-pulse" /><div className="sheet h-96 animate-pulse" /></div>}>
      <List />
    </Suspense>
  );
}

function Card({ t }: { t: PublicTemplate }) {
  return (
    <li>
      <Link href={`/dielines/${t.id}`} className="sheet marks-hover flap group flex h-full flex-col outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flap-corner" aria-hidden />
        <span className="paper-grid-soft relative m-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border p-3">
          {t.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
            <img src={t.thumbnail} alt={`${t.name} dieline template`} loading="lazy" className="max-h-full max-w-full transition-transform duration-300 group-hover:scale-[1.05]" />
          ) : null}
          {t.has3d ? <span className="absolute top-2 left-2 rounded-full bg-[var(--ink,#16213a)] px-2 py-0.5 font-mono text-[11px] font-medium text-white">3D</span> : null}
        </span>
        <span className="flex flex-col gap-1 px-4 pt-1.5 pb-4">
          <span className="font-display text-base font-semibold tracking-tight">{t.name}</span>
          {t.description ? <span className="line-clamp-2 text-sm text-muted-foreground">{t.description}</span> : null}
        </span>
      </Link>
    </li>
  );
}

async function List() {
  const { templates, categories } = await getPublicCatalogue();
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  const uses = categories.filter((c) => c.kind === "use");
  const grouped = uses.map((c) => ({ c, items: templates.filter((t) => t.categoryKeys.includes(c.key)) })).filter((g) => g.items.length);
  const seen = new Set(grouped.flatMap((g) => g.items.map((t) => t.id)));
  const rest = templates.filter((t) => !seen.has(t.id));
  return (
    <div className="flex flex-col gap-10">
      <JsonLd data={breadcrumbJsonLd(origin, [{ name: "Home", path: "/" }, { name: "Dielines", path: "/dielines" }])} />
      <JsonLd data={itemListJsonLd(origin, "Dieline templates", templates.map((t) => ({ name: t.name, path: `/dielines/${t.id}` })))} />
      <StudioBand
        chip={`${templates.length} dieline template${templates.length === 1 ? "" : "s"}`}
        title="Dieline templates"
        description="Pick a box style, then type your own width, depth and height. Every dieline is calculated for your size, folds in 3D and exports to PDF, AI, EPS, SVG or DXF."
        actions={<Link href="/register" className="cta inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold">Start free <ArrowRight className="size-4" aria-hidden /></Link>}
      />
      <section aria-label="What a dieline is" className="max-w-3xl text-base leading-relaxed text-muted-foreground">
        <h2 className="font-display mb-2 text-2xl font-bold tracking-tight text-foreground">What is a dieline?</h2>
        <p>A dieline is the flat plan of a box or carton: the outline to cut, the lines to crease and fold, the glue flaps and the bleed around the edge. Printers and cutting tables use it to make a box from a single sheet of board. The templates below build one for you from the size you need, so the artwork you place on it lines up with every panel.</p>
      </section>
      {grouped.map(({ c, items }) => (
        <section key={c.key} aria-labelledby={`c-${c.slug}`} className="flex flex-col gap-4">
          <h2 id={`c-${c.slug}`} className="font-display text-2xl font-bold tracking-tight">{c.name} dielines</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((t) => <Card key={t.id} t={t} />)}</ul>
        </section>
      ))}
      {rest.length ? (
        <section aria-labelledby="c-more" className="flex flex-col gap-4">
          {grouped.length ? <h2 id="c-more" className="font-display text-2xl font-bold tracking-tight">More box styles</h2> : <h2 id="c-more" className="sr-only">Box styles</h2>}
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rest.map((t) => <Card key={t.id} t={t} />)}</ul>
        </section>
      ) : null}
      {templates.length === 0 ? <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">No templates are published yet.</p> : null}
    </div>
  );
}
