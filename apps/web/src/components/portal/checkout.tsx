"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { formatPhone } from "@/lib/phone";
import { BD_DISTRICTS, COUNTRIES, DEFAULT_COUNTRY } from "@/lib/places";
import { portalHome, portalLogin, portalOrders } from "@/lib/portal-paths";
import { useCart } from "./cart";
import { SearchSelect } from "./district-select";

export interface CheckoutCustomer {
  phone: string;
  fullName: string;
  country: string;
  district: string;
  address: string;
}

const field = "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The cart and the order form: templates with quantity and details, then the customer's contact details and notes. No prices anywhere. */
export function Checkout({ userHash, homeScope, customer }: { userHash: string; homeScope: string | null; customer: CheckoutCustomer | null }) {
  const router = useRouter();
  const { lines, patch, remove, clear } = useCart(userHash);
  const [fullName, setFullName] = useState(customer?.fullName ?? "");
  const [country, setCountry] = useState((COUNTRIES as readonly string[]).includes(customer?.country ?? "") ? customer!.country : DEFAULT_COUNTRY);
  const [district, setDistrict] = useState(customer?.district ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-14 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-sm text-muted-foreground">Choose templates and add them to the cart.</p>
        <Link href={portalHome(userHash, homeScope)} className="inline-flex h-9 items-center rounded-lg cta px-4 text-sm font-medium text-primary-foreground">Browse templates</Link>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/portal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userHash, items: lines.map((l) => ({ templateHash: l.hash, quantity: l.quantity, details: l.details })), customer: { fullName, country, district, address }, notes }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; number?: number };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "The order could not be placed.");
      return;
    }
    clear();
    notify.success(`Order ORD-${1000 + (json.number ?? 0)} was sent.`);
    router.push(`${portalOrders(userHash)}?placed=${json.number ?? ""}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section aria-label="Cart" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your cart <span className="text-sm font-normal text-muted-foreground">({lines.length} template{lines.length === 1 ? "" : "s"})</span></h2>
        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.hash} className="flex gap-3 sheet p-3">
              <div className="grid size-20 shrink-0 place-items-center rounded-lg bg-muted/50 p-1.5">
                {l.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
                  <img src={l.thumbnail} alt="" className="max-h-full max-w-full" />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{l.name}</p>
                  <button type="button" onClick={() => remove(l.hash)} aria-label={`Remove ${l.name}`} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" aria-hidden /></button>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="One less" onClick={() => patch(l.hash, { quantity: l.quantity - 1 })} className="grid size-8 place-items-center rounded-md border hover:bg-muted"><Minus className="size-3.5" aria-hidden /></button>
                  <input aria-label={`Quantity of ${l.name}`} inputMode="numeric" value={l.quantity} onChange={(e) => patch(l.hash, { quantity: Number(e.target.value.replace(/\D/g, "")) || 1 })} className="h-8 w-16 rounded-md border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <button type="button" aria-label="One more" onClick={() => patch(l.hash, { quantity: l.quantity + 1 })} className="grid size-8 place-items-center rounded-md border hover:bg-muted"><Plus className="size-3.5" aria-hidden /></button>
                </div>
                <input aria-label={`Details for ${l.name}`} value={l.details} maxLength={500} onChange={(e) => patch(l.hash, { details: e.target.value })} placeholder="Details: size, material, colours…" className="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your details" className="flex flex-col gap-4 self-start sheet p-5">
        <h2 className="text-lg font-semibold">Your details</h2>
        {!customer ? (
          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 text-sm">
            <p>Please sign in with your mobile number to send the order. Your cart stays as it is.</p>
            <Link href={portalLogin(userHash, `/${userHash}/cart`)} className="inline-flex h-10 items-center justify-center rounded-lg cta px-4 font-medium text-primary-foreground">Sign in with mobile number</Link>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Full name <span className="text-destructive">*</span></span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Mobile number</span>
              <input value={formatPhone(customer.phone)} readOnly aria-readonly className={`${field} bg-muted text-muted-foreground`} />
            </label>
            <SearchSelect label="Country" value={country} options={COUNTRIES} onChange={(c) => { setCountry(c); setDistrict(""); }} required />
            {country === DEFAULT_COUNTRY ? (
              <SearchSelect label="District" value={district} options={BD_DISTRICTS} onChange={setDistrict} required placeholder="Choose your district" />
            ) : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">City or district <span className="text-destructive">*</span></span>
                <input value={district} onChange={(e) => setDistrict(e.target.value)} required maxLength={80} className={field} />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Full address <span className="text-destructive">*</span></span>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} required minLength={5} maxLength={400} rows={3} autoComplete="street-address" className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <button type="submit" disabled={busy || (country === DEFAULT_COUNTRY && !district)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg cta text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Send order
            </button>
            <p className="text-center text-xs text-muted-foreground">No payment is taken here. The shop will contact you on your mobile number.</p>
          </form>
        )}
      </section>
    </div>
  );
}
