import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { CustomerProfileForm } from "@/components/app/customer-profile-form";
import { loadMyDashboard } from "@/server/my-templates";
import { DashboardClient } from "@/components/my-dashboard/dashboard-client";
import { AddSystemDialog } from "@/components/my-dashboard/add-system-dialog";

export const metadata = { title: "My dashboard" };

/** Profile settings: the customer's own contact details, plus how they sign in. */
async function ProfileTab() {
  const user = await requireUser();
  const [row, accounts] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { name: true, phone: true, altPhone: true, businessName: true, businessAddress: true } }),
    db.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
  ]);
  const methods = accounts.map((a) => (a.providerId === "credential" ? "Email & password" : a.providerId === "google" ? "Google" : a.providerId));
  return (
    <section className="flex max-w-2xl flex-col gap-8" aria-label="Profile settings">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Profile settings</h2>
          <p className="text-sm text-muted-foreground">Your details. Only you can see and change them here.</p>
        </div>
        <CustomerProfileForm values={{ name: row?.name ?? user.name, phone: row?.phone ?? "", altPhone: row?.altPhone ?? "", businessName: row?.businessName ?? "", businessAddress: row?.businessAddress ?? "" }} />
      </div>
      <div className="flex flex-col gap-1 border-t pt-6 text-sm">
        <h3 className="font-medium">Account</h3>
        <p>Email: {user.email} {user.emailVerified ? "(confirmed)" : "(not confirmed)"}</p>
        <p>Sign-in methods: {methods.join(", ") || "none"}</p>
      </div>
    </section>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/my-dashboard">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = str("tab") === "profile" ? "profile" : "templates";
  const data = tab === "templates" ? await loadMyDashboard(user.id) : null;
  const sort = str("sort") === "name" || str("sort") === "oldest" ? (str("sort") as "name" | "oldest") : "updated";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My dashboard</h1>
          <p className="text-muted-foreground">Welcome, {user.name.split(" ")[0]}. {tab === "profile" ? "Keep your details up to date." : "Your templates, with your own categories and tags."}</p>
        </div>
        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            <AddSystemDialog categories={data.categories} />
          </div>
        ) : null}
      </div>

      <nav aria-label="Dashboard sections" className="-mt-2 flex gap-1 border-b text-sm">
        {([["templates", "My templates", "/my-dashboard"], ["profile", "Profile settings", "/my-dashboard?tab=profile"]] as const).map(([id, label, href]) => (
          <Link key={id} href={href} aria-current={tab === id ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 ${tab === id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</Link>
        ))}
      </nav>

      {data ? (
        <DashboardClient
          templates={data.templates}
          categories={data.categories}
          tags={data.tags}
          total={data.total}
          initial={{ q: str("q").trim().slice(0, 100), cat: str("cat").slice(0, 60), tag: str("tag").slice(0, 60), sort, view: str("view") === "list" ? "list" : "grid" }}
        />
      ) : (
        <ProfileTab />
      )}
    </div>
  );
}

export default function MyDashboardPage({ searchParams }: PageProps<"/my-dashboard">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
