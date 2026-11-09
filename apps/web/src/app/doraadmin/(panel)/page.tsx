import type { ReactNode } from "react";
import { overviewStats } from "@/server/admin-stats";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Overview" };

const fmt = new Intl.NumberFormat("en");
const bytes = (n: number) => (n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default async function AdminOverview() {
  await requireSuperAdmin();
  const s = await overviewStats();
  const max = Math.max(1, ...s.signups14.map((d) => d.count));
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Counts only. Times are UTC.</p>
      </div>

      <section aria-labelledby="h-users" className="flex flex-col gap-3">
        <h2 id="h-users" className="font-medium">Users</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Total users" value={fmt.format(s.users.total)} sub={`${fmt.format(s.users.verified)} email-verified`} />
          <Tile label="New, last 7 days" value={fmt.format(s.users.new7)} sub={`${fmt.format(s.users.new30)} in 30 days`} />
          <Tile label="Active, last 7 days" value={fmt.format(s.users.active7)} sub="users with a session touched" />
          <Tile label="Suspended" value={fmt.format(s.users.banned)} />
        </div>
      </section>

      <section aria-labelledby="h-signups" className="flex flex-col gap-3">
        <h2 id="h-signups" className="font-medium">Sign-ups, last 14 days</h2>
        <div className="rounded-xl border p-4">
          <ul className="flex h-32 items-end gap-1.5" aria-label="Sign-ups per day">
            {s.signups14.map((d) => (
              <li key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.count}`}>
                <span className="mb-1 text-center text-[10px] tabular-nums text-muted-foreground">{d.count || ""}</span>
                <span className="w-full rounded-t bg-primary" style={{ height: `${Math.max(d.count ? 6 : 1, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{s.signups14[0]!.day}</span>
            <span>{s.signups14.at(-1)!.day}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="h-content" className="flex flex-col gap-3">
        <h2 id="h-content" className="font-medium">Content and usage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Projects" value={fmt.format(s.projects.total)} sub={`${fmt.format(s.projects.new7)} new in 7 days`} />
          <Tile label="Uploaded images" value={fmt.format(s.assets.total)} sub={bytes(s.assets.bytes)} />
          <Tile label="Exports, last 24 h" value={fmt.format(s.last24h.exports)} sub={`${fmt.format(s.last24h.uploads)} uploads in 24 h`} />
          <Tile
            label="AI requests, last 7 days"
            value={fmt.format(s.aiRequests7)}
            sub={s.aiOutcomes.length ? s.aiOutcomes.map((o) => `${o.outcome} ${o.count}`).join(", ") : "none yet"}
          />
        </div>
        <p className="text-xs text-muted-foreground">Exports and uploads are counted from rate-limit records, which are kept for 24 hours.</p>
      </section>
    </div>
  );
}
