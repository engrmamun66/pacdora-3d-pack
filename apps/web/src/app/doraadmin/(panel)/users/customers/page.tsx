import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/server/db";
import { requireSuperAdmin } from "@/server/admin";
import { fmtDateTime } from "@/lib/format-date";

export const metadata = { title: "Clients Customers" };

const PAGE_SIZE = 25;

/** The people who signed up on Clients' portals (by mobile number) and the Clients they ordered from. Read only. */
export default async function AdminClientCustomers({ searchParams }: PageProps<"/doraadmin/users/customers">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1));
  const digits = q.replace(/\D/g, "");
  const where = q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { district: { contains: q, mode: "insensitive" as const } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {};
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        phone: true,
        fullName: true,
        district: true,
        country: true,
        createdAt: true,
        orders: { orderBy: { createdAt: "desc" }, select: { createdAt: true, client: { select: { id: true, name: true, businessName: true } } } },
      },
    }),
    db.customer.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/doraadmin/users/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients Customers"
        description={`${total} ${total === 1 ? "customer" : "customers"} signed up on Clients' portals${q ? ` matching "${q}"` : ""}. Times are Bangladesh time.`}
        actions={
          <form className="flex gap-2" role="search">
            <label className="sr-only" htmlFor="q">Search by name, phone or district</label>
            <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Name, phone or district" className="h-9 w-64 rounded-lg border border-input bg-card px-2.5 text-sm" />
            <button type="submit" className="h-9 rounded-lg border bg-card px-3 text-sm hover:bg-muted">Search</button>
          </form>
        }
      />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">District</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Orders</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Ordered from</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Joined</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Last order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const clients = [...new Map(c.orders.map((o) => [o.client.id, o.client])).values()];
              return (
                <tr key={c.id} className="border-b align-top transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.fullName || <span className="text-muted-foreground">No name yet</span>}</p>
                    <p className="text-xs text-muted-foreground">+{c.phone}</p>
                  </td>
                  <td className="px-4 py-3">{c.district ? `${c.district}${c.country !== "Bangladesh" ? `, ${c.country}` : ""}` : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{c.orders.length}</td>
                  <td className="px-4 py-3">
                    {clients.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {clients.map((cl) => <li key={cl.id}><Link href={`/doraadmin/users/${cl.id}`} className="underline-offset-4 hover:underline">{cl.businessName?.trim() || cl.name}</Link></li>)}
                      </ul>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(c.createdAt.toISOString())}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{c.orders[0] ? fmtDateTime(c.orders[0].createdAt.toISOString()) : "never"}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No customers found.</td></tr> : null}
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
