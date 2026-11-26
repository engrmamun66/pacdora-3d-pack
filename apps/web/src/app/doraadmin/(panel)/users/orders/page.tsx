import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ClientOrdersTable, adminOrderSelect } from "@/components/admin/client-orders-table";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { ORDER_STATUSES, STATUS_LABEL, isOrderStatus } from "@/lib/order-status";

export const metadata = { title: "Client Orders" };

const PAGE_SIZE = 25;

/** Every order placed on any Client's portal. Read only: the Client works the orders from their own dashboard. */
export default async function AdminClientOrders({ searchParams }: PageProps<"/doraadmin/users/orders">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim().slice(0, 100);
  const st = isOrderStatus(str("status")) ? str("status") : "";
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(str("page") || "1")) || 1));
  const digits = q.replace(/\D/g, "");
  const num = /^(ord-?)?\d+$/i.test(q) ? Number(digits) - 1000 : null;
  const where = {
    ...(st ? { status: st } : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { client: { name: { contains: q, mode: "insensitive" as const } } },
            { client: { businessName: { contains: q, mode: "insensitive" as const } } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
            ...(num !== null ? [{ number: num }] : []),
          ],
        }
      : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: adminOrderSelect }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/doraadmin/users/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(st ? { status: st } : {}), page: String(p) })}`;
  const select = "h-9 rounded-lg border border-input bg-card px-2.5 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Client Orders" description={`${total} ${total === 1 ? "order" : "orders"} placed on Clients' portals${q || st ? " (filtered)" : ""}. Times are Bangladesh time.`} />
      <form className="flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search by order number, customer, phone or client</label>
        <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Order, customer, phone or client" className={`${select} w-72`} />
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={st} className={select}>
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({byStatus.get(s) ?? 0})</option>)}
        </select>
        <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm hover:bg-muted">Filter</button>
      </form>
      <ClientOrdersTable orders={rows} />
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

/** Reads the signed-in session, so it cannot be part of a static shell. */
export const instant = false;
