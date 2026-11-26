import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { BanButton } from "@/components/admin/ban-button";
import { ClientOrdersTable, adminOrderSelect } from "@/components/admin/client-orders-table";
import { db } from "@/server/db";
import { SUPERADMIN, requireSuperAdmin } from "@/server/admin";
import { templateHash } from "@/server/share-hash";
import { portalHome, portalTemplate } from "@/lib/portal-paths";
import { fmtDateTime } from "@/lib/format-date";

export const metadata = { title: "Client" };

const TABS = [
  { key: "templates", label: "Templates" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
  { key: "links", label: "Portal links" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const MAX_ROWS = 200;

const Off = () => <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Off</span>;
const On = () => <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">On</span>;

/** Everything about one Client: their templates, the customers who ordered from them, the orders and the portal links. Read only. */
export default async function AdminClient({ params, searchParams }: PageProps<"/doraadmin/users/[id]">) {
  const admin = await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === sp.tab)?.key ?? "templates";

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      businessName: true,
      emailVerified: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      _count: { select: { projects: true, assets: true, clientOrders: true } },
    },
  });
  if (!user || user.role === SUPERADMIN) notFound();

  const [links, customerCount, newOrders] = await Promise.all([
    db.shareLink.findMany({ where: { userId: id }, orderBy: { createdAt: "asc" }, select: { scope: true, targetId: true, projectId: true, hash: true, active: true } }),
    db.customer.count({ where: { orders: { some: { clientId: id } } } }),
    db.order.count({ where: { clientId: id, status: "new" } }),
  ]);
  const allLink = links.find((l) => l.scope === "all") ?? null;
  const title = user.businessName?.trim() || user.name;

  const href = (t: Tab) => `/doraadmin/users/${id}?tab=${t}`;
  const counts: Record<Tab, number> = { templates: user._count.projects, orders: user._count.clientOrders, customers: customerCount, links: links.filter((l) => l.scope !== "template").length };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {title}
            {user.banned ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive" title={user.banReason ?? undefined}>Suspended</span> : null}
            <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${user.emailVerified ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300"}`}>{user.emailVerified ? "Verified" : "Unverified"}</span>
          </span>
        }
        description={`${user.name} · ${user.email} · joined ${fmtDateTime(user.createdAt.toISOString())} · last active ${user.sessions[0] ? fmtDateTime(user.sessions[0].updatedAt.toISOString()) : "never"}`}
        actions={
          <>
            {allLink?.active ? (
              <Link href={portalHome(allLink.hash)} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted">
                Open portal <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null}
            {user.id === admin.id ? null : <BanButton userId={user.id} email={user.email} banned={user.banned} />}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Templates", user._count.projects],
          ["Images", user._count.assets],
          ["Orders", user._count.clientOrders],
          ["New orders", newOrders],
          ["Customers", customerCount],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border bg-card px-4 py-3 shadow-xs">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Client sections" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label} <span className="ml-1 text-xs tabular-nums text-muted-foreground">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {tab === "templates" ? <TemplatesTab userId={id} allHash={allLink?.hash ?? null} links={links} total={user._count.projects} /> : null}
      {tab === "orders" ? <OrdersTab userId={id} total={user._count.clientOrders} /> : null}
      {tab === "customers" ? <CustomersTab userId={id} /> : null}
      {tab === "links" ? <LinksTab userId={id} links={links} /> : null}
    </div>
  );
}

type LinkRow = { scope: string; targetId: string | null; projectId: string | null; hash: string; active: boolean };

async function TemplatesTab({ userId, allHash, links, total }: { userId: string; allHash: string | null; links: LinkRow[]; total: number }) {
  const rows = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, name: true, createdAt: true, updatedAt: true, template: { select: { id: true, name: true } }, category: { select: { name: true } }, tags: { select: { tag: { select: { name: true } } } }, _count: { select: { assets: true } } },
  });
  const off = new Set(links.filter((l) => l.scope === "template" && !l.active && l.projectId).map((l) => l.projectId));
  const allOn = links.find((l) => l.scope === "all")?.active ?? false;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Template</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Made from</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Category and tags</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Images</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Shared</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const shared = allHash && allOn && !off.has(p.id);
              return (
                <tr key={p.id} className="border-b align-top transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3"><Link href={`/doraadmin/templates/${p.template.id}/edit`} className="underline-offset-4 hover:underline">{p.template.name}</Link></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 text-xs">
                      {p.category ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{p.category.name}</span> : null}
                      {p.tags.map((t) => <span key={t.tag.name} className="rounded-full bg-muted px-2 py-0.5">{t.tag.name}</span>)}
                      {!p.category && !p.tags.length ? <span className="text-muted-foreground">—</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p._count.assets}</td>
                  <td className="px-4 py-3">
                    {shared && allHash ? (
                      <Link href={portalTemplate(allHash, null, templateHash(p.id))} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
                        On <ExternalLink className="size-3" aria-hidden />
                      </Link>
                    ) : <Off />}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(p.updatedAt.toISOString())}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">This client has no templates yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {total > rows.length ? <p className="text-xs text-muted-foreground">Showing the {rows.length} most recently updated of {total}.</p> : null}
    </div>
  );
}

async function OrdersTab({ userId, total }: { userId: string; total: number }) {
  const rows = await db.order.findMany({ where: { clientId: userId }, orderBy: { createdAt: "desc" }, take: MAX_ROWS, select: adminOrderSelect });
  return (
    <div className="flex flex-col gap-3">
      <ClientOrdersTable orders={rows} showClient={false} />
      {total > rows.length ? <p className="text-xs text-muted-foreground">Showing the {rows.length} newest of {total}. <Link href="/doraadmin/users/orders" className="underline">Search all orders</Link></p> : null}
    </div>
  );
}

async function CustomersTab({ userId }: { userId: string }) {
  const rows = await db.customer.findMany({
    where: { orders: { some: { clientId: userId } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, phone: true, fullName: true, district: true, country: true, createdAt: true, orders: { where: { clientId: userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } } },
  });
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
            <th scope="col" className="px-4 py-2.5 font-medium">District</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Orders</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Last order</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
              <td className="px-4 py-3">
                <p className="font-medium">{c.fullName || <span className="text-muted-foreground">No name yet</span>}</p>
                <p className="text-xs text-muted-foreground">+{c.phone}</p>
              </td>
              <td className="px-4 py-3">{c.district ? `${c.district}${c.country !== "Bangladesh" ? `, ${c.country}` : ""}` : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{c.orders.length}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{c.orders[0] ? fmtDateTime(c.orders[0].createdAt.toISOString()) : "—"}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(c.createdAt.toISOString())}</td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No customer has ordered from this client yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

async function LinksTab({ userId, links }: { userId: string; links: LinkRow[] }) {
  const [cats, tags] = await Promise.all([db.userCategory.findMany({ where: { userId }, select: { id: true, name: true } }), db.userTag.findMany({ where: { userId }, select: { id: true, name: true } })]);
  const all = links.find((l) => l.scope === "all");
  const nameOf = new Map([...cats, ...tags].map((x) => [x.id, x.name]));
  const rows = links.filter((l) => l.scope === "category" || l.scope === "tag");
  if (!all) return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">This client has not opened their dashboard yet, so no portal links exist.</p>;
  const item = (label: string, kind: string, hash: string, active: boolean, scopeHash: string | null) => (
    <tr key={hash} className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3 font-medium">{label}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{kind}</td>
      <td className="px-4 py-3"><Link href={portalHome(all.hash, scopeHash)} target="_blank" rel="noopener" className="font-mono text-xs underline-offset-4 hover:underline">{portalHome(all.hash, scopeHash)}</Link></td>
      <td className="px-4 py-3">{active ? <On /> : <Off />}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Shares</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Kind</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Address</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {item("All templates", "All", all.hash, all.active, null)}
          {rows.map((l) => item(nameOf.get(l.targetId ?? "") ?? "(removed)", l.scope === "category" ? "Category" : "Tag", l.hash, l.active, l.hash))}
        </tbody>
      </table>
    </div>
  );
}

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
