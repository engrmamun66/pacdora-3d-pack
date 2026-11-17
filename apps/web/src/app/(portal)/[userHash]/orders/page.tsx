import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { OrdersPage } from "@/components/portal/pages";

export default function Page(props: { params: Promise<{ userHash: string }>; searchParams: Promise<{ placed?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrdersPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
