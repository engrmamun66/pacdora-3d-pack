/** Placeholder while a portal page loads: the banner and a grid of sheets. */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      <div className="paper-grid sheet h-36 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="sheet aspect-[4/3.4] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

const bar = "animate-pulse rounded-md bg-muted";

/**
 * Placeholder while one shared template page loads: the same layout as the page. Breadcrumbs, the 3D stage with its Sample tabs on the
 * left; on the right the name, the design samples grid and the order card.
 */
export function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      <div className="flex items-center gap-2">
        <div className={`${bar} h-4 w-20`} />
        <div className={`${bar} h-4 w-3`} />
        <div className={`${bar} h-4 w-32`} />
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="paper-grid sheet aspect-[4/3] animate-pulse" />
          <div className="flex items-start gap-2 px-1 pt-1 pb-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 p-0.5">
                <div className="sheet aspect-square w-full animate-pulse" />
                <div className={`${bar} h-3 w-12`} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className={`${bar} h-9 w-3/4`} />
            <div className={`${bar} h-4 w-1/2`} />
          </div>
          <div className="flex flex-col gap-2">
            <div className={`${bar} h-4 w-28`} />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="sheet aspect-[4/3] animate-pulse" />
              ))}
            </div>
          </div>
          <div className="sheet flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className={`${bar} h-4 w-20`} />
              <div className={`${bar} h-9 w-36`} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className={`${bar} h-4 w-full`} />
              <div className={`${bar} h-4 w-2/5`} />
              <div className={`${bar} mt-0.5 h-[4.75rem] w-full`} />
            </div>
            <div className={`${bar} h-10 w-full`} />
          </div>
          <div className={`${bar} h-3 w-4/5`} />
        </div>
      </div>
    </div>
  );
}
