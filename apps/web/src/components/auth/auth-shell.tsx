import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { site } from "@/config/site";
import { AuthArt } from "./auth-art";

const POINTS = ["Dielines calculated from your dimensions", "Live 3D fold with your artwork", "PDF, Illustrator, DXF and more"];

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-semibold ${className}`}>
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
      </span>
      {site.name}
    </Link>
  );
}

/**
 * Split-screen auth layout: brand panel on large screens, form on the right.
 * Every auth page gets a way back to the home page.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  variant = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "admin";
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_10%,rgb(255_255_255/0.14),transparent)]" aria-hidden />
        {variant === "default" ? <AuthArt /> : null}
        <Logo className="relative text-primary-foreground" />
        <div className="relative max-w-md">
          {variant === "admin" ? (
            <>
              <h2 className="text-3xl font-semibold tracking-tight">Restricted area</h2>
              <p className="mt-3 opacity-80">Administration for {site.name}. Sign-ins here are for authorised staff only.</p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">Packaging dielines that fold the way you designed them.</h2>
              <ul className="mt-6 flex flex-col gap-3 text-sm">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-center gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20"><Check className="size-3" aria-hidden /></span>
                    {p}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="relative text-xs opacity-70">{site.tagline}</p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
          <div className="flex flex-col gap-1.5">
            {variant === "admin" ? <p className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Super admin</p> : null}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="flex flex-col gap-4">{children}</div>
          {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
