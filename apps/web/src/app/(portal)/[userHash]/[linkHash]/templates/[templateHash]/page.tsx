import { Suspense } from "react";
import { DetailSkeleton } from "@/components/portal/page-skeleton";
import { DetailPage } from "@/components/portal/pages";

export default function Page({ params }: { params: Promise<{ userHash: string; linkHash: string; templateHash: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailPage params={params} />
    </Suspense>
  );
}
