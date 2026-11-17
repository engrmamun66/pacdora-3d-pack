"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Printer } from "lucide-react";
import { notify } from "@/lib/notify";
import { ORDER_STATUSES, STATUS_HINT, STATUS_LABEL, STATUS_TONE, type OrderStatus } from "@/lib/order-status";
import { setLinkActive, setTemplateShared, updateOrderStatus, type ActionResult } from "@/app/(dash)/my-dashboard/portal-actions";

const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Copies `text` to the clipboard (the full address of a link). */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch {
          notify.error("The link could not be copied. Select it and copy by hand.");
        }
      }}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {done ? "Copied" : label}
    </button>
  );
}

export function OpenLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={btn}>
      <ExternalLink className="size-3.5" aria-hidden /> Open
    </a>
  );
}

export function PrintButton() {
  return (
    <button type="button" className={btn} onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden /> Print
    </button>
  );
}

/** An On / Off switch that saves at once. */
export function Switch({ on, label, run }: { on: boolean; label: string; run: (next: boolean) => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);
  const [seen, setSeen] = useState(on);
  if (seen !== on) {
    setSeen(on);
    setValue(on);
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !value;
          setValue(next);
          const r = await run(next);
          if (!r.ok) {
            setValue(!next);
            notify.error(r.message);
          } else router.refresh();
        })
      }
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60 ${value ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-[left] ${value ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export const LinkSwitch = ({ linkId, on, label }: { linkId: string; on: boolean; label: string }) => <Switch on={on} label={label} run={(next) => setLinkActive(linkId, next)} />;
export const TemplateSwitch = ({ projectId, on, label }: { projectId: string; on: boolean; label: string }) => <Switch on={on} label={label} run={(next) => setTemplateShared(projectId, next)} />;

/** The statuses of an order as a row of buttons, in the order the work goes. */
export function StatusControl({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label="Order status" className="flex flex-wrap gap-1.5">
      {ORDER_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === status}
          disabled={pending}
          title={STATUS_HINT[s]}
          onClick={() =>
            start(async () => {
              if (s === status) return;
              const r = await updateOrderStatus(orderId, s);
              if (!r.ok) notify.error(r.message);
              else {
                notify.success(`Marked as ${STATUS_LABEL[s].toLowerCase()}.`, { id: "order-status" });
                router.refresh();
              }
            })
          }
          className={`h-9 rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${s === status ? `${STATUS_TONE[s]} border-transparent ring-1 ring-current` : "hover:bg-muted"}`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
