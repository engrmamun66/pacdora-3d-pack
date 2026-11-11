import type { ReactNode } from "react";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { ProfileForm } from "@/components/app/profile-form";
import { requireSuperAdmin } from "@/server/admin";
import { db } from "@/server/db";

export const metadata = { title: "Profile" };

const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
const METHODS: Record<string, string> = { credential: "Email and password", google: "Google" };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-48 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** The signed-in super admin: who they are, how they sign in, and their own password. */
export default async function AdminProfile() {
  const admin = await requireSuperAdmin();
  const [user, lastSession, sessions, accounts, projects] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: admin.id }, select: { createdAt: true } }),
    db.session.findFirst({ where: { userId: admin.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.session.count({ where: { userId: admin.id, expiresAt: { gt: new Date() } } }),
    db.account.findMany({ where: { userId: admin.id }, select: { providerId: true } }),
    db.project.count({ where: { userId: admin.id } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-xs">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">{initials(admin.name)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{admin.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{admin.email}</p>
          <p className="mt-1 flex gap-1.5 text-xs">
            <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">Super admin</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Email verified</span>
          </p>
        </div>
      </div>

      <section aria-labelledby="h-details" className="flex flex-col gap-3">
        <h2 id="h-details" className="font-medium">Details</h2>
        <dl className="max-w-2xl rounded-xl border bg-card px-5 shadow-xs">
          <Row label="Name">{admin.name}</Row>
          <Row label="Email">{admin.email}</Row>
          <Row label="Role">Super admin</Row>
          <Row label="Member since">{date(user.createdAt)}</Row>
          <Row label="Last activity">{lastSession ? date(lastSession.updatedAt) : "never"}</Row>
          <Row label="Active sessions">{sessions}</Row>
          <Row label="Sign-in methods">{accounts.map((a) => METHODS[a.providerId] ?? a.providerId).join(", ") || "none"}</Row>
          <Row label="Own projects">{projects}</Row>
        </dl>
      </section>

      <section aria-labelledby="h-name" className="flex max-w-md flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
        <h2 id="h-name" className="font-medium">Display name</h2>
        <ProfileForm name={admin.name} />
      </section>

      <section aria-labelledby="h-pw" className="flex max-w-md flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
        <h2 id="h-pw" className="font-medium">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
