import type { ReactNode } from "react";
import { Activity, Download, FolderOpen, ImageUp, Sparkles, UserPlus, UserX, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { overviewStats } from "@/server/admin-stats";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Overview" };

const fmt = new Intl.NumberFormat("en");
const bytes = (n: number) => (n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);

/** One number with its label; the icon chip is colour-coded by group. */
function Tile({ label, value, sub, icon: Icon, tone = "primary" }: { label: string; value: ReactNode; sub?: string; icon: LucideIcon; tone?: "primary" | "sky" | "emerald" | "amber" | "rose" }) {
  const chip = {
    primary: "bg-primary/10 text-primary",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {sub ? <p className="mt-1 truncate text-xs text-muted-foreground" title={sub}>{sub}</p> : null}
      </div>
      <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-lg ${chip}`}>
        <Icon className="size-5" />
      </span>
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function AdminOverview() {
  await requireSuperAdmin();
  const s = await overviewStats();
  const max = Math.max(1, ...s.signups14.map((d) => d.count));
  const total14 = s.signups14.reduce((n, d) => n + d.count, 0);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" description="How the site is being used. Counts only; times are UTC." />

      <Section id="h-users" title="Users">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={Users} label="Total users" value={fmt.format(s.users.total)} sub={`${fmt.format(s.users.verified)} email-verified`} />
          <Tile icon={UserPlus} tone="sky" label="New, last 7 days" value={fmt.format(s.users.new7)} sub={`${fmt.format(s.users.new30)} in 30 days`} />
          <Tile icon={Activity} tone="emerald" label="Active, last 7 days" value={fmt.format(s.users.active7)} sub="users with a session touched" />
          <Tile icon={UserX} tone="rose" label="Suspended" value={fmt.format(s.users.banned)} />
        </div>
      </Section>

      <Section id="h-signups" title="Sign-ups" note={`${fmt.format(total14)} in the last 14 days`}>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <ul className="flex h-40 items-end gap-2" aria-label="Sign-ups per day">
            {s.signups14.map((d) => (
              <li key={d.day} className="group flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.count}`}>
                <span className="mb-1 text-center text-[11px] tabular-nums text-muted-foreground">{d.count || ""}</span>
                <span
                  className={`w-full rounded-md transition-colors ${d.count ? "bg-primary group-hover:bg-primary/75" : "bg-muted"}`}
                  style={{ height: `${Math.max(d.count ? 8 : 3, (d.count / max) * 100)}%` }}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t pt-2 text-xs text-muted-foreground">
            <span>{s.signups14[0]!.day}</span>
            <span>{s.signups14.at(-1)!.day}</span>
          </div>
        </div>
      </Section>

      <Section id="h-content" title="Content and usage" note="Exports and uploads come from rate-limit records, kept for 24 hours.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={FolderOpen} tone="amber" label="Projects" value={fmt.format(s.projects.total)} sub={`${fmt.format(s.projects.new7)} new in 7 days`} />
          <Tile icon={ImageUp} tone="sky" label="Uploaded images" value={fmt.format(s.assets.total)} sub={bytes(s.assets.bytes)} />
          <Tile icon={Download} tone="emerald" label="Exports, last 24 h" value={fmt.format(s.last24h.exports)} sub={`${fmt.format(s.last24h.uploads)} uploads in 24 h`} />
          <Tile
            icon={Sparkles}
            label="AI requests, last 7 days"
            value={fmt.format(s.aiRequests7)}
            sub={s.aiOutcomes.length ? s.aiOutcomes.map((o) => `${o.outcome} ${o.count}`).join(", ") : "none yet"}
          />
        </div>
      </Section>
    </div>
  );
}
