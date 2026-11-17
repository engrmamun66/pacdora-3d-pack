import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { CartPage } from "@/components/portal/pages";

export default function Page({ params }: { params: Promise<{ userHash: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CartPage params={params} />
    </Suspense>
  );
}
