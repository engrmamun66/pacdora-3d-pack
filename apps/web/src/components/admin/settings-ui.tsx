import type { ReactNode } from "react";

/** Title block for one settings tab. */
export function SettingsHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** One label/value line inside a <dl>. */
export function Row({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-56 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">
        {children}
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </dd>
    </div>
  );
}

export const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{ok ? yes : no}</span>
);
