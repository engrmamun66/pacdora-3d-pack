import type { ReactNode } from "react";
import { DielineNet, PackBox } from "./pack-box";

/**
 * The banner at the top of a Client page or a shared shop page: graph paper, the faint flat sheet of a box behind the
 * words, and a box turning on the right. `chip` is a short fact in the small mono label (for example "12 templates").
 */
export function StudioBand({ chip, title, description, actions, children }: { chip?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="paper-grid marks sheet relative overflow-hidden">
      <DielineNet className="pointer-events-none absolute -top-6 right-10 hidden h-[135%] w-auto opacity-[0.3] md:block" />
      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-6 sm:px-8 sm:py-8">
        <div className="min-w-0 flex-1 basis-72">
          {chip ? <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-card/90 px-2.5 py-1 font-mono text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--cut)]" aria-hidden />{chip}</p> : null}
          <h1 className="text-3xl leading-[1.05] sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
          {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <div className="hidden shrink-0 sm:block">
          <PackBox w={72} h={100} d={50} />
        </div>
        {children}
      </div>
      <div className="crease-line mx-5 sm:mx-8" aria-hidden />
    </section>
  );
}
