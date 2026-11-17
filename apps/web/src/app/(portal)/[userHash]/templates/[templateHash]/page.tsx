import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { DetailPage } from "@/components/portal/pages";

export default function Page({ params }: { params: Promise<{ userHash: string; templateHash: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DetailPage params={params} />
    </Suspense>
  );
}
