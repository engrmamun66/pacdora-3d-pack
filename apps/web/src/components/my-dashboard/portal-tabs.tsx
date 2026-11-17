import Link from "next/link";
import { ArrowRight, ClipboardList, Hammer, Inbox, Link2, Search, ShoppingBag, Shapes, Store, Package, type LucideIcon } from "lucide-react";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ensureLinks } from "@/server/portal";
import { templateHash } from "@/server/share-hash";
import { getClientOrder, listClientOrders, orderCounts, type OrderRow } from "@/server/orders";
import { ORDER_STATUSES, STATUS_LABEL, STATUS_TONE, isOrderStatus, orderNumber, type OrderStatus } from "@/lib/order-status";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { formatPhone } from "@/lib/phone";
import { portalHome, portalTemplate } from "@/lib/portal-paths";
import { QrButton } from "./qr-dialog";
import { CopyButton, LinkSwitch, OpenLink, PrintButton, StatusControl, TemplateSwitch } from "./portal-controls";

const origin = () => new URL(env.BETTER_AUTH_URL).origin;
const card = "sheet";

const StatusBadge = ({ status }: { status: OrderStatus }) => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;

function OrdersTable({ orders }: { orders: OrderRow[] }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Order</th>
            <th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium">District</th>
            <th className="px-4 py-2.5 text-right font-medium">Items</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-4 py-3"><Link href={`/my-dashboard/orders/${o.id}`} className="font-mono font-medium underline-offset-2 hover:underline">{orderNumber(o.number)}</Link></td>
              <td className="px-4 py-3"><div className="font-medium">{o.customerName}</div><div className="text-xs text-muted-foreground">{formatPhone(o.phone)}</div></td>
              <td className="px-4 py-3">{o.district || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{o.itemCount} <span className="text-xs text-muted-foreground">({o.quantity} pcs)</span></td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(o.createdAt)}</td>
              <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ icon: Icon, title, hint, action }: { icon: typeof Inbox; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--crease)]/50 bg-card/60 px-4 py-12 text-center">
      <Icon className="size-7 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ Overview

export async function OverviewTab({ userId }: { userId: string }) {
  await ensureLinks(userId);
  const [counts, recent, templates, all] = await Promise.all([
    orderCounts(userId),
    listClientOrders(userId, { take: 5 }),
    db.project.count({ where: { userId } }),
    db.shareLink.findFirst({ where: { userId, scope: "all" }, select: { id: true, hash: true, active: true } }),
  ]);
  const shop = all ? `${origin()}${portalHome(all.hash)}` : null;
  const stat = (label: string, value: number, href: string, Icon: LucideIcon, color: string, hot = false) => (
    <Link href={href} className={`${card} marks-hover group relative flex flex-col gap-3 overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <span className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}><Icon className="size-4" aria-hidden /></span>
      </span>
      <span className={`font-display text-4xl leading-none font-bold tabular-nums ${hot && value > 0 ? "text-[var(--cut)]" : ""}`}>{value}</span>
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Orders at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("New orders", counts.new, "/my-dashboard?tab=orders&status=new", ClipboardList, "var(--cut)", true)}
        {stat("In progress", counts.in_progress + counts.confirmed, "/my-dashboard?tab=orders&status=in_progress", Hammer, "var(--board-deep)")}
        {stat("All orders", counts.all, "/my-dashboard?tab=orders", Package, "var(--crease)")}
        {stat("Templates", templates, "/my-dashboard?tab=templates", Shapes, "var(--ink)")}
      </section>

      <section aria-label="Your shop link" className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}>
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-white"><Store className="size-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">Your shop page</p>
          <p className="truncate text-sm text-muted-foreground">{shop ?? "Not ready"}</p>
        </div>
        {shop && all ? (
          <div className="flex flex-wrap items-center gap-2">
            <LinkSwitch linkId={all.id} on={all.active} label="Shop page on or off" />
            <CopyButton text={shop} />
            <OpenLink href={shop} />
          </div>
        ) : null}
      </section>

      <section aria-label="Recent orders" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Recent orders</h2>
          {recent.length ? <Link href="/my-dashboard?tab=orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">All orders <ArrowRight className="size-3.5" aria-hidden /></Link> : null}
        </div>
        {recent.length ? <OrdersTable orders={recent} /> : <Empty icon={Inbox} title="No orders yet" hint="When a customer sends an order from your shop page, it shows up here." action={shop ? <CopyButton text={shop} label="Copy your shop link" /> : null} />}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Orders

export async function OrdersTab({ userId, status, q }: { userId: string; status: string; q: string }) {
  const current = isOrderStatus(status) ? status : null;
  const [counts, orders] = await Promise.all([orderCounts(userId), listClientOrders(userId, { ...(current ? { status: current } : {}), q })]);
  const chip = (id: OrderStatus | null, label: string, n: number) => {
    const on = id === current;
    const qs = new URLSearchParams({ tab: "orders", ...(id ? { status: id } : {}), ...(q ? { q } : {}) });
    return (
      <Link key={id ?? "all"} href={`/my-dashboard?${qs}`} aria-current={on ? "page" : undefined} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
        {label} <span className={`text-xs tabular-nums ${on ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
      </Link>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter orders" className="flex flex-wrap gap-1.5">
          {chip(null, "All", counts.all)}
          {ORDER_STATUSES.map((s) => chip(s, STATUS_LABEL[s], counts[s]))}
        </nav>
        <form action="/my-dashboard" className="relative w-full sm:w-64">
          <input type="hidden" name="tab" value="orders" />
          {current ? <input type="hidden" name="status" value={current} /> : null}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Name, phone or order number" aria-label="Search orders" maxLength={60} className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </form>
      </div>
      {orders.length ? <OrdersTable orders={orders} /> : counts.all === 0 ? <Empty icon={Inbox} title="No orders yet" hint="Share your shop link from the Share tab. Orders your customers send appear here." action={<Link href="/my-dashboard?tab=share" className="mt-1 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85">Go to Share</Link>} /> : <Empty icon={Search} title="No order matches" hint="Try another status or a different search." />}
    </div>
  );
}

export async function OrderDetail({ userId, id }: { userId: string; id: string }) {
  const o = await getClientOrder(userId, id);
  if (!o) return <Empty icon={Inbox} title="Order not found" hint="It may belong to another account." action={<Link href="/my-dashboard?tab=orders" className="mt-1 text-sm underline">Back to orders</Link>} />;
  const wa = `https://wa.me/${o.phone}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/my-dashboard?tab=orders" className="text-sm text-muted-foreground hover:text-foreground">← All orders</Link>
        <PrintButton />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Order {orderNumber(o.number)}</h1>
          <p className="text-sm text-muted-foreground">Sent {fmtDateTime(o.createdAt)}</p>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <section aria-label="Status" className={`${card} flex flex-col gap-3 p-4 print:hidden`}>
        <h2 className="font-medium">Status</h2>
        <StatusControl orderId={o.id} status={o.status} />
      </section>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Items" className={`${card} overflow-hidden`}>
          <h2 className="border-b px-4 py-3 font-medium">Templates ordered</h2>
          <ul>
            {o.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-4 border-b px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">{i.name}</p>
                  {i.details ? <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{i.details}</p> : null}
                  {i.projectId ? <Link href={`/projects/${i.projectId}`} className="mt-1 inline-block text-xs text-muted-foreground underline print:hidden">Open template</Link> : <span className="mt-1 inline-block text-xs text-muted-foreground">Template was deleted</span>}
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums">× {i.quantity}</span>
              </li>
            ))}
          </ul>
          {o.notes ? <div className="border-t bg-muted/30 px-4 py-3 text-sm"><p className="mb-1 font-medium">Customer notes</p><p className="whitespace-pre-line text-muted-foreground">{o.notes}</p></div> : null}
        </section>
        <section aria-label="Customer" className={`${card} flex flex-col gap-3 self-start p-4`}>
          <h2 className="font-medium">Customer</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{o.customerName}</dd></div>
            <div>
              <dt className="text-muted-foreground">Mobile</dt>
              <dd className="flex flex-wrap items-center gap-2"><a href={`tel:+${o.phone}`} className="font-medium underline-offset-2 hover:underline">{formatPhone(o.phone)}</a><a href={wa} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline print:hidden">WhatsApp</a></dd>
            </div>
            <div><dt className="text-muted-foreground">Delivery</dt><dd>{o.address}<br />{o.district ? `${o.district}, ` : ""}{o.country}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Share

export async function ShareTab({ userId }: { userId: string }) {
  await ensureLinks(userId);
  const [links, cats, tags, projects, hidden] = await Promise.all([
    db.shareLink.findMany({ where: { userId, scope: { in: ["all", "category", "tag"] } }, select: { id: true, scope: true, targetId: true, hash: true, active: true } }),
    db.userCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { projects: true } } } }),
    db.userTag.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { projects: true } } } }),
    db.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true } }),
    db.shareLink.findMany({ where: { userId, scope: "template", active: false }, select: { projectId: true } }),
  ]);
  const all = links.find((l) => l.scope === "all");
  if (!all) return <Empty icon={Link2} title="Links are being prepared" hint="Please reload this page." />;
  const base = origin();
  const byTarget = (scope: string, id: string) => links.find((l) => l.scope === scope && l.targetId === id);
  const off = new Set(hidden.flatMap((h) => (h.projectId ? [h.projectId] : [])));

  const row = (key: string, title: string, sub: string, url: string, active: boolean, control: React.ReactNode) => (
    <li key={key} className="flex flex-col gap-2 border-b px-4 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title} <span className="text-sm font-normal text-muted-foreground">· {sub}</span></p>
        <p className="truncate text-xs text-muted-foreground">{url}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {control}
        <CopyButton text={url} />
        <QrButton path={url.slice(base.length)} label={title} active={active} withText />
        <OpenLink href={url} />
      </div>
    </li>
  );
  const section = (title: string, hint: string, children: React.ReactNode, count: number) => (
    <section aria-label={title} className="flex flex-col gap-2">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {count ? <ul className={card}>{children}</ul> : <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nothing here yet. {title === "Categories" ? "Create a category on My templates." : title === "Tags" ? "Add tags on My templates." : ""}</p>}
    </section>
  );
  const allUrl = `${base}${portalHome(all.hash)}`;
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Shop page" className={`${card} flex flex-col gap-3 p-4`}>
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-white"><ShoppingBag className="size-5" aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold">All my templates</h2>
            <p className="text-sm text-muted-foreground">Your whole shop. Customers see every template that is switched on, add them to a cart and send an order.</p>
          </div>
          <LinkSwitch linkId={all.id} on={all.active} label="All templates link on or off" />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm">{allUrl}</span>
          <CopyButton text={allUrl} />
          <QrButton path={portalHome(all.hash)} label="All templates" active={all.active} withText />
          <OpenLink href={allUrl} />
        </div>
        <p className="text-xs text-muted-foreground">Each link is permanent. Switching a link off hides the page; switching it on again brings back the same address.</p>
      </section>

      {section("Categories", "One link per category.", cats.map((c) => { const l = byTarget("category", c.id); return l ? row(c.id, c.name, `${c._count.projects} template${c._count.projects === 1 ? "" : "s"}`, `${base}${portalHome(all.hash, l.hash)}`, l.active, <LinkSwitch linkId={l.id} on={l.active} label={`${c.name} link on or off`} />) : null; }), cats.length)}
      {section("Tags", "One link per tag.", tags.map((t) => { const l = byTarget("tag", t.id); return l ? row(t.id, t.name, `${t._count.projects} template${t._count.projects === 1 ? "" : "s"}`, `${base}${portalHome(all.hash, l.hash)}`, l.active, <LinkSwitch linkId={l.id} on={l.active} label={`${t.name} link on or off`} />) : null; }), tags.length)}
      {section("Single templates", "A link to one template. Switching one off hides it from every page, including the lists above.", projects.map((p) => row(p.id, p.name, "template", `${base}${portalTemplate(all.hash, null, templateHash(p.id))}`, !off.has(p.id), <TemplateSwitch projectId={p.id} on={!off.has(p.id)} label={`${p.name} on or off`} />)), projects.length)}
    </div>
  );
}

