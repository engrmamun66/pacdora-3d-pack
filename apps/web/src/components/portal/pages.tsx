import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronRight, EyeOff } from "lucide-react";
import { getOwner, findScope, findPortalTemplate, listPortalTemplates, loadPortalScene } from "@/server/portal";
import { getCustomer } from "@/server/customer-auth";
import { listCustomerOrders } from "@/server/orders";
import { STATUS_LABEL, STATUS_TONE, orderNumber } from "@/lib/order-status";
import { portalHome, portalOrder } from "@/lib/portal-paths";
import { TemplateGrid } from "./template-grid";
import { AddToCart } from "./add-to-cart";
import { TemplatePreview } from "./template-preview";
import { DesignSamples, SampleDesignProvider } from "./sample-design";
import { listFeaturedBackgrounds, listLayouts } from "@/server/layouts";
import { Crumbs, PortalCrumbs, RememberList } from "./crumbs";
import { StudioBand } from "@/components/studio/studio-band";
import { Checkout } from "./checkout";
import { LoginForm } from "./login-form";
import { safeNext } from "@/lib/safe-next";

/** A link that is switched off, or that never existed under a Client that does. */
export function Unavailable({ title }: { title?: string }) {
  return (
    <div className="sheet marks mx-auto mt-10 flex max-w-md flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full border border-dashed border-[var(--crease)] bg-card"><EyeOff className="size-6 text-muted-foreground" aria-hidden /></span>
      <h1 className="text-2xl">{title ?? "This page is not available right now"}</h1>
      <p className="text-sm text-muted-foreground">The owner has turned this link off, or it has moved. Please ask them for a new link.</p>
    </div>
  );
}

/** /{user}/templates and /{user}/{link}/templates */
export async function ListPage({ params }: { params: Promise<{ userHash: string; linkHash?: string }> }) {
  const { userHash, linkHash } = await params;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const scope = await findScope(owner, linkHash ?? null);
  if (!scope) return <Unavailable />;
  const templates = await listPortalTemplates(owner, scope);
  return (
    <div className="flex flex-col gap-5">
      <RememberList userHash={userHash} path={portalHome(userHash, scope.linkHash)} label={scope.kind === "all" ? "Templates" : `Templates: ${scope.label}`} />
      <StudioBand
        chip={`${templates.length} template${templates.length === 1 ? "" : "s"}${scope.kind === "all" ? "" : ` · ${scope.kind === "category" ? "category" : "tag"}`}`}
        title={scope.kind === "all" ? owner.title : scope.label}
        description={scope.kind === "all" ? "Pick a box, set the quantity, and send your order. Open a template to see it in 3D." : `${scope.kind === "category" ? "Category" : "Tag"} from ${owner.title}. Pick a box, set the quantity, and send your order.`}
      />
      <TemplateGrid userHash={userHash} scopeHash={scope.linkHash} templates={templates} columns={owner.cardColumns} image={owner.cardImage} />
    </div>
  );
}

/** /{user}/templates/{template} and /{user}/{link}/templates/{template} */
export async function DetailPage({ params }: { params: Promise<{ userHash: string; linkHash?: string; templateHash: string }> }) {
  const { userHash, linkHash, templateHash } = await params;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const scope = await findScope(owner, linkHash ?? null);
  if (!scope) return <Unavailable />;
  const t = await findPortalTemplate(owner, scope, templateHash);
  if (!t) return <Unavailable title="This template is not available" />;
  const [scene, layouts, backgrounds] = await Promise.all([loadPortalScene(owner, t.id), listLayouts(true), listFeaturedBackgrounds()]);
  return (
    <div className="flex flex-col gap-5">
      <RememberList userHash={userHash} path={portalHome(userHash, scope.linkHash)} label={scope.kind === "all" ? "Templates" : `Templates: ${scope.label}`} />
      <Crumbs
        items={[
          // From a category or tag list: the whole list of templates first (when that link is on), then the category or tag.
          ...(scope.kind !== "all" && owner.allActive ? [{ label: "Templates", href: portalHome(userHash) }] : []),
          { label: scope.kind === "all" ? "Templates" : scope.label, href: portalHome(userHash, scope.linkHash) },
          { label: t.name },
        ]}
      />
      {/* The first design sample (when there are some) is open from the start. */}
      <SampleDesignProvider initial={scene?.captures[0]?.id ?? null}>
      <div className="grid gap-6 md:grid-cols-[1fr_24rem]">
        <TemplatePreview userHash={userHash} name={t.name} thumbnail={t.thumbnail} scene={scene} layouts={layouts} backgrounds={backgrounds} />
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl leading-tight">{t.name}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{t.templateName}</p>
          </div>
          <DesignSamples captures={scene?.captures ?? []} />
          {t.category || t.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {t.category ? <span className="rounded-full bg-[var(--cut)]/10 px-2.5 py-0.5 text-xs text-[var(--cut)]">{t.category}</span> : null}
              {t.tags.map((x) => <span key={x} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{x}</span>)}
            </div>
          ) : null}
          <AddToCart userHash={userHash} hash={t.hash} name={t.name} thumbnail={t.thumbnail} />
          <p className="px-1 text-xs text-muted-foreground">No payment now. Send your order and {owner.title} will contact you to agree the details.</p>
        </div>
      </div>
      </SampleDesignProvider>
    </div>
  );
}

export async function CartPage({ params }: { params: Promise<{ userHash: string }> }) {
  const { userHash } = await params;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const customer = await getCustomer();
  return (
    <div className="flex flex-col gap-5">
      <PortalCrumbs userHash={userHash} current="Cart and order" />
      <h1 className="text-2xl font-semibold">Cart and order</h1>
      <Checkout userHash={userHash} homeScope={null} customer={customer ? { phone: customer.phone, fullName: customer.fullName, country: customer.country, district: customer.district, address: customer.address } : null} />
    </div>
  );
}

export async function OrdersPage({ params, searchParams }: { params: Promise<{ userHash: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { userHash } = await params;
  const { placed } = await searchParams;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const customer = await getCustomer();
  if (!customer) {
    return (
      <div className="flex flex-col gap-5">
        <PortalCrumbs userHash={userHash} current="My orders" />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-2xl">Sign in to see your orders</h1>
        <Link href={`/${userHash}/login?next=${encodeURIComponent(`/${userHash}/orders`)}`} className="inline-flex h-10 items-center rounded-lg cta px-4 text-sm font-medium text-primary-foreground">Sign in with mobile number</Link>
        </div>
      </div>
    );
  }
  const orders = await listCustomerOrders(customer.id, owner.userId);
  return (
    <div className="flex flex-col gap-5">
      <PortalCrumbs userHash={userHash} current="My orders" />
      <h1 className="text-2xl font-semibold">My orders</h1>
      {placed && /^\d+$/.test(placed) ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="size-4 shrink-0" aria-hidden /> Your order {orderNumber(Number(placed))} was sent. {owner.title} will contact you on your mobile number. <Link href={portalOrder(userHash, Number(placed))} className="font-medium underline">View order</Link></p>
      ) : null}
      {orders.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">You have not placed an order yet.</p> : null}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={portalOrder(userHash, o.number)} className="flex flex-col gap-2 sheet p-5 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{orderNumber(o.number)} <span className="text-sm font-normal text-muted-foreground">· {o.createdAt.slice(0, 10)}</span></p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
              </div>
              <ul className="text-sm text-muted-foreground">{o.items.map((i, k) => <li key={k}>{i.quantity} × {i.name}</li>)}</ul>
              <span className="flex items-center gap-1 text-sm font-medium">View details <ChevronRight className="size-4" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function LoginPage({ params, searchParams }: { params: Promise<{ userHash: string }>; searchParams: Promise<{ next?: string }> }) {
  const { userHash } = await params;
  const { next } = await searchParams;
  const owner = await getOwner(userHash);
  if (!owner) notFound();
  const fallback = `/${userHash}/cart`;
  // Only an address inside this portal is followed after signing in.
  const target = safeNext(next ?? "", fallback);
  return (
    <div className="flex flex-col gap-5">
      <PortalCrumbs userHash={userHash} current="Sign in" />
      <LoginForm next={target.startsWith(`/${userHash}/`) ? target : fallback} />
    </div>
  );
}
