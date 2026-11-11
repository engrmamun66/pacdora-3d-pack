import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/server/db";
import { SUPERADMIN, requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Customer Templates" };

const PAGE_SIZE = 25;
const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** What customers made: each project is a customer's own copy of a template (with their sizes and artwork). Read only. */
export default async function AdminCustomerTemplates({ searchParams }: PageProps<"/doraadmin/users/templates">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim().slice(0, 100);
  const tpl = str("template").slice(0, 80);
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(str("page") || "1")) || 1));
  const where = {
    user: { role: { not: SUPERADMIN } },
    ...(tpl ? { templateId: tpl } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [rows, total, templates] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true, email: true, banned: true } },
        template: { select: { id: true, name: true } },
        _count: { select: { assets: true } },
      },
    }),
    db.project.count({ where }),
    db.template.findMany({ where: { projects: { some: { user: { role: { not: SUPERADMIN } } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/doraadmin/users/templates?${new URLSearchParams({ ...(q ? { q } : {}), ...(tpl ? { template: tpl } : {}), page: String(p) })}`;
  const select = "h-9 rounded-lg border border-input bg-card px-2.5 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customer Templates"
        description={`${total} ${total === 1 ? "design" : "designs"} made by customers${q ? ` matching "${q}"` : ""}. Each one is a customer's copy of a template. Times are UTC.`}
      />

      <form className="flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search by design, customer name or email</label>
        <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Search design or customer" className={`${select} w-64`} />
        <label className="sr-only" htmlFor="template">Template</label>
        <select id="template" name="template" defaultValue={tpl} className={select}>
          <option value="">Any template</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm hover:bg-muted">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Design</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Made from</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Images</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Created</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <p>{p.user.name}{p.user.banned ? <span className="ml-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Suspended</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{p.user.email}</p>
                </td>
                <td className="px-4 py-3"><Link href={`/doraadmin/templates/${p.template.id}/edit`} className="underline-offset-4 hover:underline">{p.template.name}</Link></td>
                <td className="px-4 py-3 tabular-nums">{p._count.assets}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{date(p.createdAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{date(p.updatedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No customer designs match.</td></tr> : null}
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
