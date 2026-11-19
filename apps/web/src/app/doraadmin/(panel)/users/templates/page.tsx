import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { BulkProvider, HeaderCheck, RowCheck } from "@/components/admin/client-project-bulk";
import { ClientProjectFilters } from "@/components/admin/client-project-filters";
import { PageHeader } from "@/components/admin/page-header";
import { ClientProjectActions, type ProjectLink } from "@/components/admin/client-project-actions";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { isHash, templateHash } from "@/server/share-hash";
import { parseDay } from "@/lib/day";
import { portalTemplate } from "@/lib/portal-paths";

export const metadata = { title: "Client Templates" };

const PAGE_SIZE = 25;
const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

const SORTS = {
  updated: "Last updated",
  created: "Date created",
  name: "Design name",
  client: "Client name",
  template: "Made from (template)",
  templateId: "Template ID",
  images: "Number of images",
} as const;
type SortKey = keyof typeof SORTS;
/** Sorts on text start A to Z; the others (dates, counts) start with the newest or biggest. */
const TEXT_SORTS = new Set<SortKey>(["name", "client", "template", "templateId"]);
const isSort = (v: string): v is SortKey => v in SORTS;

/** Every project any client made (each one is the client's own copy of a template). A super admin can sort, search, rename, delete and copy the links the client opens. */
export default async function AdminCustomerTemplates({ searchParams }: PageProps<"/doraadmin/users/templates">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim().slice(0, 100);
  const tpl = str("template").slice(0, 80);
  const tid = str("tid").trim().slice(0, 80);
  const from = parseDay(str("from")) ? str("from") : "";
  const to = parseDay(str("to")) ? str("to") : "";
  const img = ["with", "none"].includes(str("img")) ? str("img") : "";
  const sort: SortKey = isSort(str("sort")) ? (str("sort") as SortKey) : "updated";
  const dir: "asc" | "desc" = str("dir") === "asc" ? "asc" : str("dir") === "desc" ? "desc" : TEXT_SORTS.has(sort) ? "asc" : "desc";
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(str("page") || "1")) || 1));

  const created = {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
  };
  // A template hash is not stored (it is calculated from the project id), so a search that holds one (or a shared address that ends in one) is matched by calculating the hash of every project.
  const wantedHashes = new Set((q.toLowerCase().match(/[a-z0-9]{12}/g) ?? []).filter(isHash));
  const hashIds = wantedHashes.size ? (await db.project.findMany({ select: { id: true } })).filter((p) => wantedHashes.has(templateHash(p.id))).map((p) => p.id) : [];
  const where = {
    ...(tpl ? { templateId: tpl } : {}),
    ...(tid ? { templateId: tpl ? { equals: tpl, contains: tid, mode: "insensitive" as const } : { contains: tid, mode: "insensitive" as const } } : {}),
    ...(from || to ? { createdAt: created } : {}),
    ...(img === "with" ? { assets: { some: {} } } : img === "none" ? { assets: { none: {} } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
            ...(hashIds.length ? [{ id: { in: hashIds } }] : []),
          ],
        }
      : {}),
  };
  const orderBy =
    sort === "name" ? { name: dir }
    : sort === "client" ? { user: { name: dir } }
    : sort === "template" ? { template: { name: dir } }
    : sort === "templateId" ? { templateId: dir }
    : sort === "images" ? { assets: { _count: dir } }
    : sort === "created" ? { createdAt: dir }
    : { updatedAt: dir };

  const [rows, total, templates] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true, email: true, banned: true } },
        template: { select: { id: true, name: true } },
        _count: { select: { assets: true } },
      },
    }),
    db.project.count({ where }),
    db.template.findMany({ where: { projects: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // The address of each project on its client's shared pages (when the client has the "all" link).
  const ids = rows.map((r) => r.id);
  const owners = [...new Set(rows.map((r) => r.userId))];
  const [allLinks, offLinks] = await Promise.all([
    db.shareLink.findMany({ where: { userId: { in: owners }, scope: "all" }, select: { userId: true, hash: true, active: true } }),
    db.shareLink.findMany({ where: { scope: "template", projectId: { in: ids }, active: false }, select: { projectId: true } }),
  ]);
  const allOf = new Map(allLinks.map((l) => [l.userId, l]));
  const off = new Set(offLinks.map((l) => l.projectId));
  const linksOf = (p: (typeof rows)[number]): ProjectLink[] => {
    const list: ProjectLink[] = [
      { label: "Online design", path: `/editor/${p.id}`, note: "The client's design page. Opens for the client only." },
      { label: "Dieline", path: `/projects/${p.id}`, note: "The client's dieline page. Opens for the client only." },
    ];
    const shared = allOf.get(p.userId);
    if (shared) list.push({ label: "Preview", path: portalTemplate(shared.hash, null, templateHash(p.id)), note: shared.active && !off.has(p.id) ? "The 3D preview customers see. Opens for anyone." : "The 3D preview customers see (switched off by the client now)." });
    return list;
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const params = (over: Record<string, string>) => {
    const base: Record<string, string> = { ...(q ? { q } : {}), ...(tpl ? { template: tpl } : {}), ...(tid ? { tid } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(img ? { img } : {}), sort, dir, ...over };
    return `/doraadmin/users/templates?${new URLSearchParams(base)}`;
  };
  const link = (p: number) => params({ page: String(p) });
  const th = "px-4 py-2.5 font-medium";
  // A column header that sorts: first click sorts one way, the next click reverses it.
  const sortHead = (key: SortKey, label: string) => {
    const on = sort === key;
    const Icon = on ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
    return (
      <th scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={th}>
        <Link href={params({ sort: key, dir: on ? (dir === "asc" ? "desc" : "asc") : TEXT_SORTS.has(key) ? "asc" : "desc", page: "1" })} className={`inline-flex items-center gap-1 hover:text-foreground ${on ? "text-foreground" : ""}`}>
          {label} <Icon className="size-3.5" aria-hidden />
        </Link>
      </th>
    );
  };
  const filtered = Boolean(q || tid || tpl || from || to || img);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Client Templates"
        description={`${total} ${total === 1 ? "design" : "designs"} made by clients${filtered ? " matching the filters" : ""}. Each one is a client's copy of a template. Times are UTC.`}
      />

      <ClientProjectFilters
        values={{ q, tid, template: tpl, from, to, img, sort, dir }}
        sorts={SORTS}
        templates={templates}
        changed={filtered || sort !== "updated" || Boolean(str("dir"))}
      />

      <BulkProvider ids={rows.map((r) => r.id)} links={Object.fromEntries(rows.map((r) => [r.id, linksOf(r)]))}>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 py-2.5 pr-0 pl-4"><HeaderCheck /></th>
              {sortHead("name", "Design")}
              {sortHead("client", "Client")}
              {sortHead("template", "Made from")}
              {sortHead("templateId", "Template ID")}
              {sortHead("images", "Images")}
              {sortHead("created", "Created")}
              {sortHead("updated", "Updated")}
              <th scope="col" className={`${th} text-right`}>Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/40 has-[[data-row-check]:checked]:bg-muted/60">
                <td className="py-3 pr-0 pl-4"><RowCheck id={p.id} name={p.name} /></td>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground" title="Template hash: search for it above, it is the last part of the shared address">T-hash <code className="font-mono">{templateHash(p.id)}</code></p>
                </td>
                <td className="px-4 py-3">
                  <p><Link href={`/doraadmin/users/${p.userId}`} className="underline-offset-4 hover:underline">{p.user.name}</Link>{p.user.banned ? <span className="ml-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Suspended</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{p.user.email}</p>
                </td>
                <td className="px-4 py-3"><Link href={`/doraadmin/templates/${p.template.id}/edit`} className="underline-offset-4 hover:underline">{p.template.name}</Link></td>
                <td className="px-4 py-3"><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{p.template.id}</code></td>
                <td className="px-4 py-3 tabular-nums">{p._count.assets}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{date(p.createdAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">{date(p.updatedAt)}</td>
                <td className="px-4 py-3"><ClientProjectActions id={p.id} name={p.name} links={linksOf(p)} /></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No client designs match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      </BulkProvider>

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
