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
