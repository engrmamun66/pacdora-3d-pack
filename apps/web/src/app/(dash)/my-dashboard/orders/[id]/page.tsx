import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { OrderDetail } from "@/components/my-dashboard/portal-tabs";

export const metadata = { title: "Order" };

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  return <OrderDetail userId={user.id} id={id.slice(0, 40)} />;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  );
}
