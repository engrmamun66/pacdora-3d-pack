"use client";

import Link from "next/link";
import { useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { notify } from "@/lib/notify";
import { portalCart } from "@/lib/portal-paths";
import { useCart } from "./cart";

/** Quantity, a note, and the Add to cart button of one template's page. */
export function AddToCart({ userHash, hash, name, thumbnail }: { userHash: string; hash: string; name: string; thumbnail: string | null }) {
  const { add, lines } = useCart(userHash);
  const [qty, setQty] = useState(1);
  const [details, setDetails] = useState("");
  const inCart = lines.find((l) => l.hash === hash);
  return (
    <div className="flex flex-col gap-4 sheet p-5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="qty" className="text-sm font-medium">Quantity</label>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="One less" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-9 place-items-center rounded-lg border hover:bg-muted"><Minus className="size-4" aria-hidden /></button>
          <input id="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 1)))} className="h-9 w-20 rounded-lg border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="button" aria-label="One more" onClick={() => setQty((q) => Math.min(1_000_000, q + 1))} className="grid size-9 place-items-center rounded-lg border hover:bg-muted"><Plus className="size-4" aria-hidden /></button>
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Details <span className="font-normal text-muted-foreground">(size, material, colours, anything we should know)</span></span>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <button
        type="button"
        onClick={() => {
          add({ hash, name, thumbnail, quantity: qty, details: details.trim() });
          notify.success(`${name} was added to your cart.`, { id: `cart-${hash}` });
        }}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg cta px-4 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ShoppingCart className="size-4" aria-hidden /> Add to cart
      </button>
      {inCart ? <p className="text-sm text-muted-foreground">{inCart.quantity} in your cart. <Link href={portalCart(userHash)} className="font-medium text-foreground underline">Go to cart</Link></p> : null}
    </div>
  );
}
