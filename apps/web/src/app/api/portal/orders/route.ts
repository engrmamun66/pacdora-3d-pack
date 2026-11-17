import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCustomer } from "@/server/customer-auth";
import { findOwner } from "@/server/portal";
import { orderInput, placeOrder } from "@/server/orders";
import { isSameOrigin } from "@/server/same-origin";

/** A signed-in customer places an order on a Client's portal. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: "Please sign in with your mobile number first." }, { status: 401 });
  const parsed = orderInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "The order is not complete." }, { status: 400 });
  const owner = await findOwner(parsed.data.userHash);
  if (!owner) return NextResponse.json({ error: "This shop is not available." }, { status: 404 });
  // A shop with every link switched off takes no orders.
  const open = owner.allActive || (await db.shareLink.count({ where: { userId: owner.userId, scope: { in: ["category", "tag"] }, active: true } })) > 0;
  if (!open) return NextResponse.json({ error: "This shop is not taking orders now." }, { status: 403 });
  // At most 10 orders per customer per hour.
  const recent = await db.order.count({ where: { customerId: customer.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) return NextResponse.json({ error: "Too many orders in the last hour. Please try again later." }, { status: 429 });
  const r = await placeOrder(owner, customer, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, orderId: r.orderId, number: r.number });
}
