import { Suspense } from "react";
import { PageSkeleton } from "@/components/portal/page-skeleton";
import { LoginPage } from "@/components/portal/pages";

export default function Page(props: { params: Promise<{ userHash: string }>; searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LoginPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
