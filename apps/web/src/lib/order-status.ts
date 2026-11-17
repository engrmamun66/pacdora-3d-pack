/** Where an order is in the Client's work. Plain words, in the order the work goes. */
export const ORDER_STATUSES = ["new", "confirmed", "in_progress", "done", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = { new: "New", confirmed: "Confirmed", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const STATUS_HINT: Record<OrderStatus, string> = {
  new: "Just arrived, not looked at yet",
  confirmed: "You agreed to make it",
  in_progress: "Being made",
  done: "Finished and handed over",
  cancelled: "Will not be made",
};
/** Tailwind classes of the little status label. */
export const STATUS_TONE: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  confirmed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};
export const isOrderStatus = (s: string): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s);
export const orderNumber = (n: number) => `ORD-${1000 + n}`;

/** What a status means to the customer who placed the order (`who` is the shop's name). */
export const customerStatusHint = (s: OrderStatus, who: string): string =>
  ({
    new: `Your order was sent. ${who} has not looked at it yet.`,
    confirmed: `${who} confirmed your order.`,
    in_progress: "Your order is being made.",
    done: "Your order is finished.",
    cancelled: "This order was cancelled.",
  })[s];

/** The steps an order goes through, in order. A cancelled order is shown on its own, not as a step. */
export const ORDER_STEPS: readonly OrderStatus[] = ["new", "confirmed", "in_progress", "done"];
