import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, MapPin, Phone, StickyNote, User, XCircle } from "lucide-react";
import { getOwner } from "@/server/portal";
import { getCustomer } from "@/server/customer-auth";
import { getCustomerOrder } from "@/server/orders";
import { ORDER_STEPS, STATUS_LABEL, STATUS_TONE, customerStatusHint, orderNumber } from "@/lib/order-status";
import { fmtDateTime } from "@/lib/format-date";
import { formatPhone } from "@/lib/phone";
import { portalLogin, portalOrders, portalTemplate } from "@/lib/portal-paths";
import { PortalCrumbs } from "./crumbs";

const box = "flex flex-col gap-3 sheet p-5";

/** /{user}/orders/{number}: one order of the signed-in customer, with where it stands. */
export async function OrderDetailPage({ params }: { params: Promise<{ userHash: string; number: string }> }) {
  const { userHash, number } = await params;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const shown = /^\d{4,10}$/.test(number) ? Number(number) : NaN;
  const customer = await getCustomer();
  if (!customer) {
    return (
      <div className="flex flex-col gap-5">
        <PortalCrumbs userHash={userHash} current="Order" trail={[{ label: "My orders", href: portalOrders(userHash) }]} />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <h1 className="text-2xl">Sign in to see this order</h1>
          <Link href={portalLogin(userHash, `/${userHash}/orders/${number}`)} className="inline-flex h-10 items-center rounded-lg cta px-4 text-sm font-medium text-primary-foreground">Sign in with mobile number</Link>
        </div>
      </div>
    );
  }
  const o = Number.isFinite(shown) ? await getCustomerOrder(owner, customer.id, shown - 1000) : null;
  if (!o) {
    return (
      <div className="flex flex-col gap-5">
        <PortalCrumbs userHash={userHash} current="Order" trail={[{ label: "My orders", href: portalOrders(userHash) }]} />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <h1 className="text-xl font-semibold">We could not find this order</h1>
          <p className="text-sm text-muted-foreground">It may belong to another mobile number. Sign in with the number you ordered with.</p>
          <Link href={portalOrders(userHash)} className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">Go to my orders</Link>
        </div>
      </div>
    );
  }
  const cancelled = o.status === "cancelled";
  const at = ORDER_STEPS.indexOf(o.status);
  return (
    <div className="flex flex-col gap-5">
      <PortalCrumbs userHash={userHash} current={orderNumber(o.number)} trail={[{ label: "My orders", href: portalOrders(userHash) }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-3xl">{orderNumber(o.number)}</h1>
          <p className="text-sm text-muted-foreground">Placed {fmtDateTime(o.createdAt)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
      </div>

      <section aria-label="Order progress" className={box}>
        <p className="text-sm">{customerStatusHint(o.status, owner.title)}</p>
        {cancelled ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><XCircle className="size-4" aria-hidden /> Last update {fmtDateTime(o.updatedAt)}</p>
        ) : (
          <ol className="fold-steps grid grid-cols-4 gap-2 pt-1">
            {ORDER_STEPS.map((s, i) => {
              const done = i <= at;
              return (
                <li key={s} aria-current={i === at ? "step" : undefined} className="relative flex flex-col items-start gap-2">
                  <span className={`relative grid size-[18px] place-items-center rounded-full border-2 ${i === at ? "border-[var(--cut)] bg-[var(--cut)] text-white ring-4 ring-[var(--cut)]/15" : done ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--crease)]/50 bg-card"}`}>
                    {done && i < at ? <Check className="size-2.5" aria-hidden /> : null}
                  </span>
                  <span className={`text-xs ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}>{STATUS_LABEL[s]}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-[1fr_20rem]">
        <section aria-label="Items" className={box}>
          <h2 className="font-display text-lg font-semibold">Items <span className="text-sm font-normal text-muted-foreground">({o.items.length} template{o.items.length === 1 ? "" : "s"}, {o.quantity} in all)</span></h2>
          <ul className="flex flex-col divide-y">
            {o.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40">
                  {i.template?.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                    <img src={i.template.thumbnail} alt="" className="max-h-full max-w-full p-1" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {i.template ? <Link href={portalTemplate(userHash, null, i.template.hash)} className="hover:underline">{i.name}</Link> : i.name}
                  </p>
                  <p className="text-sm text-muted-foreground">Quantity: {i.quantity}</p>
                  {i.details ? <p className="mt-1 text-sm whitespace-pre-wrap">{i.details}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-5">
          <section aria-label="Delivery details" className={box}>
            <h2 className="font-display text-lg font-semibold">Your details</h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex gap-2"><dt className="sr-only">Name</dt><User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd>{o.customerName}</dd></div>
              <div className="flex gap-2"><dt className="sr-only">Mobile number</dt><Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd>{formatPhone(o.phone)}</dd></div>
              <div className="flex gap-2"><dt className="sr-only">Address</dt><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd>{o.address}<br />{o.district}, {o.country}</dd></div>
              {o.notes ? <div className="flex gap-2"><dt className="sr-only">Notes</dt><StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dd className="whitespace-pre-wrap">{o.notes}</dd></div> : null}
            </dl>
          </section>
          <p className="text-xs text-muted-foreground">Questions about this order? Contact {owner.title} and tell them the order number {orderNumber(o.number)}.</p>
        </div>
      </div>
    </div>
  );
}
