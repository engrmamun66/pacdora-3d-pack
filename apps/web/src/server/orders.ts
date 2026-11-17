import "server-only";
import { z } from "zod";
import { db } from "./db";
import { findOrderableTemplates, type PortalOwner } from "./portal";
import { templateHash } from "./share-hash";
import { COUNTRIES, DEFAULT_COUNTRY, isBdDistrict } from "@/lib/places";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";

export const MAX_ITEMS_PER_ORDER = 30;
export const MAX_QUANTITY = 1_000_000;

const text = (max: number) => z.string().trim().max(max);

/** What a customer sends to place an order. The cart holds template hashes, quantities and a note for each. */
export const orderInput = z.object({
  userHash: z.string().min(8).max(20),
  items: z
    .array(z.object({ templateHash: z.string().length(12), quantity: z.number().int().min(1).max(MAX_QUANTITY), details: text(500).default("") }))
    .min(1, "Your cart is empty.")
    .max(MAX_ITEMS_PER_ORDER, `An order can have ${MAX_ITEMS_PER_ORDER} templates at most.`),
  customer: z.object({
    fullName: text(120).min(2, "Please write your full name."),
    country: z.enum(COUNTRIES).default(DEFAULT_COUNTRY),
    district: text(80),
    address: text(400).min(5, "Please write your full address."),
  }),
  notes: text(1000).default(""),
});
export type OrderInput = z.infer<typeof orderInput>;

export type PlaceResult = { ok: true; orderId: string; number: number } | { ok: false; message: string };

/** Make the order of a signed-in customer on a Client's portal. Contact details are copied onto it and kept on the customer for next time. */
export async function placeOrder(owner: PortalOwner, customer: { id: string; phone: string }, input: OrderInput): Promise<PlaceResult> {
  const c = input.customer;
  if (c.country === "Bangladesh" && !isBdDistrict(c.district)) return { ok: false, message: "Please choose your district." };
  if (c.country !== "Bangladesh" && !c.district) return { ok: false, message: "Please write your city or district." };

  // The same template twice in the cart is one line.
  const lines = new Map<string, { quantity: number; details: string }>();
  for (const i of input.items) {
    const prev = lines.get(i.templateHash);
    lines.set(i.templateHash, { quantity: Math.min(MAX_QUANTITY, (prev?.quantity ?? 0) + i.quantity), details: i.details || prev?.details || "" });
  }
  const found = await findOrderableTemplates(owner, [...lines.keys()]);
  if (found.size !== lines.size) return { ok: false, message: "One of the templates is not available any more. Please remove it from your cart." };

  const order = await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customer.id }, data: { fullName: c.fullName, country: c.country, district: c.district, address: c.address } });
    return tx.order.create({
      data: {
        clientId: owner.userId,
        customerId: customer.id,
        customerName: c.fullName,
        phone: customer.phone,
        country: c.country,
        district: c.district,
        address: c.address,
        notes: input.notes,
        items: { create: [...lines].map(([hash, l]) => ({ projectId: found.get(hash)!.id, name: found.get(hash)!.name, quantity: l.quantity, details: l.details })) },
      },
      select: { id: true, number: true },
    });
  });
  return { ok: true, orderId: order.id, number: order.number };
}

// ---------------------------------------------------------------- for the Client

export interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  phone: string;
  district: string;
  createdAt: string;
  itemCount: number;
  quantity: number;
}

export interface OrderDetail extends OrderRow {
  country: string;
  address: string;
  notes: string;
  items: { id: string; projectId: string | null; name: string; quantity: number; details: string }[];
}

const asStatus = (s: string): OrderStatus => (isOrderStatus(s) ? s : "new");

export async function listClientOrders(clientId: string, opts: { status?: OrderStatus; q?: string; take?: number } = {}): Promise<OrderRow[]> {
  const q = opts.q?.trim();
  const num = q && /^(ord-?)?\d+$/i.test(q) ? Number(q.replace(/\D/g, "")) - 1000 : null;
  const rows = await db.order.findMany({
    where: {
      clientId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(q ? { OR: [{ customerName: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || "no-digits" } }, ...(num !== null ? [{ number: num }] : [])] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
    select: { id: true, number: true, status: true, customerName: true, phone: true, district: true, createdAt: true, items: { select: { quantity: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, status: asStatus(r.status), customerName: r.customerName, phone: r.phone, district: r.district, createdAt: r.createdAt.toISOString(), itemCount: r.items.length, quantity: r.items.reduce((a, i) => a + i.quantity, 0) }));
}

export async function getClientOrder(clientId: string, id: string): Promise<OrderDetail | null> {
  const r = await db.order.findFirst({ where: { id, clientId }, include: { items: { orderBy: { name: "asc" } } } });
  if (!r) return null;
  return {
    id: r.id,
    number: r.number,
    status: asStatus(r.status),
    customerName: r.customerName,
    phone: r.phone,
    district: r.district,
    country: r.country,
    address: r.address,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    itemCount: r.items.length,
    quantity: r.items.reduce((a, i) => a + i.quantity, 0),
    items: r.items.map((i) => ({ id: i.id, projectId: i.projectId, name: i.name, quantity: i.quantity, details: i.details })),
  };
}

export async function setOrderStatus(clientId: string, id: string, status: OrderStatus): Promise<boolean> {
  const r = await db.order.updateMany({ where: { id, clientId }, data: { status } });
  return r.count === 1;
}

export async function orderCounts(clientId: string): Promise<Record<OrderStatus | "all", number>> {
  const g = await db.order.groupBy({ by: ["status"], where: { clientId }, _count: { _all: true } });
  const out = { all: 0, new: 0, confirmed: 0, in_progress: 0, done: 0, cancelled: 0 } as Record<OrderStatus | "all", number>;
  for (const row of g) {
    out.all += row._count._all;
    if (isOrderStatus(row.status)) out[row.status] += row._count._all;
  }
  return out;
}

// ---------------------------------------------------------------- for the customer

/** A customer's own orders at one Client's portal. */
export async function listCustomerOrders(customerId: string, clientId: string) {
  const rows = await db.order.findMany({ where: { customerId, clientId }, orderBy: { createdAt: "desc" }, take: 100, include: { items: { select: { name: true, quantity: true } } } });
  return rows.map((r) => ({ id: r.id, number: r.number, status: asStatus(r.status), createdAt: r.createdAt.toISOString(), items: r.items }));
}

export interface CustomerOrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  phone: string;
  country: string;
  district: string;
  address: string;
  notes: string;
  quantity: number;
  /** `template` is set while the Client still shares that template (so it can be opened and shown); null after they took it down. */
  items: { id: string; name: string; quantity: number; details: string; template: { hash: string; thumbnail: string | null } | null }[];
}

/** One order of this customer at this Client's portal, by its number. Null when there is no such order, or it is somebody else's. */
export async function getCustomerOrder(owner: PortalOwner, customerId: string, number: number): Promise<CustomerOrderDetail | null> {
  if (!Number.isSafeInteger(number) || number < 1 || number > 2_000_000_000) return null;
  const r = await db.order.findFirst({ where: { number, customerId, clientId: owner.userId }, include: { items: { orderBy: { name: "asc" } } } });
  if (!r) return null;
  const hashes = r.items.flatMap((i) => (i.projectId ? [templateHash(i.projectId)] : []));
  const shared = await findOrderableTemplates(owner, hashes);
  return {
    id: r.id,
    number: r.number,
    status: asStatus(r.status),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    customerName: r.customerName,
    phone: r.phone,
    country: r.country,
    district: r.district,
    address: r.address,
    notes: r.notes,
    quantity: r.items.reduce((a, i) => a + i.quantity, 0),
    items: r.items.map((i) => {
      const t = i.projectId ? shared.get(templateHash(i.projectId)) : undefined;
      return { id: i.id, name: i.name, quantity: i.quantity, details: i.details, template: t ? { hash: t.hash, thumbnail: t.thumbnail } : null };
    }),
  };
}
