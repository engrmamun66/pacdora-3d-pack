import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Plus } from "lucide-react";
import { TemplateRowActions } from "@/components/admin/template-row-actions";
import { svgDataUrl, tryThumbnail } from "@/lib/dieline-preview";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { TEMPLATE_STATUSES, isTemplateStatus, templateStatus, templateStatusLabel } from "@/lib/template-status";

export const metadata = { title: "Templates" };

const PAGE_SIZE = 20;
const date = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminTemplates({ searchParams }: PageProps<"/doraadmin/templates">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim().slice(0, 100);
  const cat = str("cat").slice(0, 60);
  const source = ["builtin", "svg"].includes(str("source")) ? str("source") : "";
  const status = isTemplateStatus(str("status")) ? str("status") : "";
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(str("page") || "1")) || 1));

  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { id: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(cat ? { categories: { some: { id: cat } } } : {}),
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total, cats] = await Promise.all([
    db.template.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, source: true, status: true, published: true, updatedAt: true, generatorId: true, hasFold: true, defaultParameters: true, thumbnail: true, widthMm: true, heightMm: true,
        categories: { select: { id: true, name: true, kind: true }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        _count: { select: { projects: true } },
      },
    }),
    db.template.count({ where }),
    db.templateCategory.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true, kind: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/doraadmin/templates?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { cat } : {}), ...(source ? { source } : {}), ...(status ? { status } : {}), page: String(p) })}`;
  const select = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Templates"
        description={<>{total} {total === 1 ? "template" : "templates"}. Public address: <code className="rounded bg-muted px-1 py-0.5 text-xs">/template/dieline/&lt;slug&gt;</code></>}
        actions={
          <Link href="/doraadmin/templates/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> Add template
          </Link>
        }
      />

      <form className="-mt-2 flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search name or slug</label>
        <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Search name or slug" className={`${select} w-56`} />
        <label className="sr-only" htmlFor="cat">Category</label>
        <select id="cat" name="cat" defaultValue={cat} className={select}>
          <option value="">All categories</option>
          {(["use", "model"] as const).map((k) => (
            <optgroup key={k} label={k === "use" ? "By uses" : "By models"}>
              {cats.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="sr-only" htmlFor="source">Source</label>
        <select id="source" name="source" defaultValue={source} className={select}>
          <option value="">Any source</option>
          <option value="builtin">Built-in (parametric)</option>
          <option value="svg">Imported SVG</option>
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status} className={select}>
          <option value="">Any status</option>
          {TEMPLATE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm hover:bg-muted">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Preview</span></th>
              <th scope="col" className="px-4 py-2.5 font-medium">Template</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Categories</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const thumb = t.source === "svg" ? (t.thumbnail ? svgDataUrl(t.thumbnail) : null) : tryThumbnail(t.generatorId, t.defaultParameters);
              return (
                <tr key={t.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="grid h-14 w-20 place-items-center overflow-hidden rounded-md border bg-white">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                        <img src={thumb} alt="" className="max-h-full max-w-full" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">no preview</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.id}</p>
                    {t.widthMm ? <p className="text-xs text-muted-foreground">{t.widthMm.toFixed(0)} × {t.heightMm?.toFixed(0)} mm sheet</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {t.categories.length ? t.categories.map((c) => <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs" title={c.kind === "use" ? "By uses" : "By models"}>{c.name}</span>) : <span className="text-xs text-amber-700">No category</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{t.source === "svg" ? "Imported SVG" : "Built-in"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${t.status === "published" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{templateStatusLabel(t.status)}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">{date(t.updatedAt)}</td>
                  <td className="px-4 py-3"><TemplateRowActions slug={t.id} name={t.name} source={t.source} status={templateStatus(t.status)} has3d={t.source === "builtin" || t.hasFold} /></td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No templates match.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={link(page - 1)}>Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={link(page + 1)}>Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
