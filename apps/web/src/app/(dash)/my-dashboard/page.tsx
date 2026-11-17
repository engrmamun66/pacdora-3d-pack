import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { CustomerProfileForm } from "@/components/app/customer-profile-form";
import { BusinessLogoField } from "@/components/app/business-logo-field";
import { BrandProvider } from "@/components/my-dashboard/brand-context";
import { getBrand } from "@/server/portal";
import { loadMyDashboard } from "@/server/my-templates";
import { DashboardClient } from "@/components/my-dashboard/dashboard-client";
import { AddSystemDialog } from "@/components/my-dashboard/add-system-dialog";
import { OrdersTab, OverviewTab, ShareTab } from "@/components/my-dashboard/portal-tabs";
import { orderCounts } from "@/server/orders";
import { StudioBand } from "@/components/studio/studio-band";
import { ClipboardList, LayoutGrid, QrCode, Settings, Shapes } from "lucide-react";

export const metadata = { title: "My dashboard" };

/** Profile settings: the customer's own contact details, plus how they sign in. */
async function ProfileTab() {
  const user = await requireUser();
  const [row, accounts] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { name: true, phone: true, altPhone: true, businessName: true, businessAddress: true } }),
    db.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
  ]);
  const brand = await getBrand(user.id);
  const methods = accounts.map((a) => (a.providerId === "credential" ? "Email & password" : a.providerId === "google" ? "Google" : a.providerId));
  return (
    <section className="grid items-start gap-5 lg:grid-cols-2" aria-label="Profile settings">
      <div className="sheet marks flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Your brand</h2>
          <p className="text-sm text-muted-foreground">Your logo and business name show at the top of every shared page, and on printed QR codes. Your business name is set in the form below{brand.name ? "" : "; until then your own name is used"}.</p>
        </div>
        <BusinessLogoField logoUrl={brand.logoUrl} name={brand.name} />
      </div>
      <div className="sheet flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Profile settings</h2>
          <p className="text-sm text-muted-foreground">Your details. Only you can see and change them here.</p>
        </div>
        <CustomerProfileForm values={{ name: row?.name ?? user.name, phone: row?.phone ?? "", altPhone: row?.altPhone ?? "", businessName: row?.businessName ?? "", businessAddress: row?.businessAddress ?? "" }} />
      </div>
      <div className="sheet flex flex-col gap-1 p-6 text-sm">
        <h3 className="font-display text-lg font-semibold">Account</h3>
        <p>Email: {user.email} {user.emailVerified ? "(confirmed)" : "(not confirmed)"}</p>
        <p>Sign-in methods: {methods.join(", ") || "none"}</p>
      </div>
    </section>
  );
}

const TABS = ["overview", "templates", "orders", "share", "profile"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { overview: LayoutGrid, templates: Shapes, orders: ClipboardList, share: QrCode, profile: Settings } as const;
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", templates: "My templates", orders: "Orders", share: "Share", profile: "Profile settings" };
const SUBTITLE: Record<Tab, string> = {
  overview: "Your shop at a glance.",
  templates: "Your templates, with your own categories and tags.",
  orders: "Orders your customers sent from your shop page.",
  share: "Links to share your templates. Each one is permanent and can be switched on or off.",
  profile: "Keep your details up to date.",
};

async function Dashboard({ searchParams }: { searchParams: PageProps<"/my-dashboard">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab: Tab = (TABS as readonly string[]).includes(str("tab")) ? (str("tab") as Tab) : "overview";
  const data = tab === "templates" ? await loadMyDashboard(user.id) : null;
  const counts = await orderCounts(user.id);
  const brand = await getBrand(user.id);
  const sort = str("sort") === "name" || str("sort") === "oldest" ? (str("sort") as "name" | "oldest") : "updated";

  return (
    <BrandProvider brand={brand}>
    <div className="flex flex-col gap-6">
      <StudioBand
        chip={brand.name || "My dashboard"}
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={SUBTITLE[tab]}
        actions={data ? <AddSystemDialog categories={data.categories} /> : undefined}
      />

      <nav aria-label="Dashboard sections" className="sheet -mt-1 flex w-full gap-1 overflow-x-auto rounded-xl p-1 text-sm sm:w-fit">
        {TABS.map((id) => {
          const Icon = TAB_ICON[id];
          return (
            <Link key={id} href={id === "overview" ? "/my-dashboard" : `/my-dashboard?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 whitespace-nowrap transition-colors ${tab === id ? "bg-[var(--ink)] font-medium text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="size-4" aria-hidden />
              {TAB_LABEL[id]}
              {id === "orders" && counts.new > 0 ? <span className="rounded-full bg-[var(--cut)] px-1.5 font-mono text-[11px] leading-4 font-semibold text-white" aria-label={`${counts.new} new orders`}>{counts.new}</span> : null}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" ? <OverviewTab userId={user.id} /> : null}
      {tab === "orders" ? <OrdersTab userId={user.id} status={str("status")} q={str("q").trim().slice(0, 60)} /> : null}
      {tab === "share" ? <ShareTab userId={user.id} /> : null}
      {tab === "profile" ? <ProfileTab /> : null}
      {data ? (
        <DashboardClient
          templates={data.templates}
          categories={data.categories}
          tags={data.tags}
          total={data.total}
          share={data.share}
          initial={{ q: str("q").trim().slice(0, 100), cat: str("cat").slice(0, 60), tag: str("tag").slice(0, 60), sort, view: str("view") === "list" ? "list" : "grid" }}
        />
      ) : null}
    </div>
    </BrandProvider>
  );
}

export default function MyDashboardPage({ searchParams }: PageProps<"/my-dashboard">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
