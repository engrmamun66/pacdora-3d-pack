import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE, isOrderStatus, orderNumber, type OrderStatus } from "@/lib/order-status";
import { fmtDateTime } from "@/lib/format-date";

export interface AdminOrder {
  id: string;
  number: number;
  status: string;
  createdAt: Date;
  customerName: string;
  phone: string;
  country: string;
  district: string;
  address: string;
  notes: string;
  client?: { id: string; name: string; businessName: string | null };
  items: { id: string; name: string; quantity: number; details: string }[];
}

const status = (s: string): OrderStatus => (isOrderStatus(s) ? s : "new");

/** Orders customers placed on Clients' portals, read only. Open a row to see the items, the address and the notes. */
export function ClientOrdersTable({ orders, showClient = true }: { orders: AdminOrder[]; showClient?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Order</th>
            {showClient ? <th scope="col" className="px-4 py-2.5 font-medium">Client</th> : null}
            <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
            <th scope="col" className="px-4 py-2.5 font-medium">District</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Items</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Placed</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const st = status(o.status);
            const qty = o.items.reduce((a, i) => a + i.quantity, 0);
            return (
              <tr key={o.id} className="border-b align-top transition-colors last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <details className="group">
                    <summary className="cursor-pointer list-none underline-offset-4 group-open:mb-2 hover:underline">{orderNumber(o.number)}</summary>
                    <div className="flex max-w-md flex-col gap-2 text-xs font-normal whitespace-normal">
                      <ul className="flex flex-col gap-1">
                        {o.items.map((i) => (
                          <li key={i.id}>
                            <span className="font-medium">{i.quantity} × {i.name}</span>
                            {i.details ? <span className="block text-muted-foreground">{i.details}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <p><span className="text-muted-foreground">Address: </span>{o.address}, {o.district}, {o.country}</p>
                      {o.notes ? <p><span className="text-muted-foreground">Notes: </span>{o.notes}</p> : null}
                    </div>
                  </details>
                </td>
                {showClient ? (
                  <td className="px-4 py-3">
                    {o.client ? <Link href={`/doraadmin/users/${o.client.id}`} className="underline-offset-4 hover:underline">{o.client.businessName?.trim() || o.client.name}</Link> : null}
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <p>{o.customerName}</p>
                  <p className="text-xs text-muted-foreground">+{o.phone}</p>
                </td>
                <td className="px-4 py-3">{o.district}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">{o.items.length} <span className="text-xs text-muted-foreground">({qty} pcs)</span></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(o.createdAt.toISOString())}</td>
              </tr>
            );
          })}
          {orders.length === 0 ? <tr><td colSpan={showClient ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">No orders yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

export const adminOrderSelect = {
  id: true,
  number: true,
  status: true,
  createdAt: true,
  customerName: true,
  phone: true,
  country: true,
  district: true,
  address: true,
  notes: true,
  client: { select: { id: true, name: true, businessName: true } },
  items: { orderBy: { name: "asc" as const }, select: { id: true, name: true, quantity: true, details: true } },
} as const;
