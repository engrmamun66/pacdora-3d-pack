import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { ListPage } from "@/components/portal/pages";

export default function Page({ params }: { params: Promise<{ userHash: string; linkHash: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ListPage params={params} />
    </Suspense>
  );
}
