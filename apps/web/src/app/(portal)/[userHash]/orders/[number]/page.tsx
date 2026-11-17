import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { OrderDetailPage } from "@/components/portal/order-detail";

export default function Page(props: { params: Promise<{ userHash: string; number: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderDetailPage params={props.params} />
    </Suspense>
  );
}
