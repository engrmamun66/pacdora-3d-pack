"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The home page header: it floats over the hero and stays at the top of the screen while the page scrolls.
 * Once the page has moved it becomes a rounded bar with its own background (the hero's colour, if one is set),
 * so the sections going under it stay readable. `top` is the announcement bar, above the menu.
 */
export function ScrollHeader({ children, background, top }: { children: ReactNode; background: string | null; top?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="fixed inset-x-0 top-0 z-30">
      {top}
      <div className={`transition-[padding] duration-300 ${scrolled ? "px-2 pt-2 sm:px-4" : ""}`}>
        <div
          className={`mx-auto border transition-[background-color,box-shadow,border-color,border-radius,max-width] duration-300 ${scrolled ? "max-w-6xl rounded-2xl shadow-[0_10px_30px_-14px_oklch(0.22_0.045_258/0.45)] backdrop-blur-md" : "max-w-7xl rounded-none border-transparent"}`}
          style={scrolled ? { background: background ?? "color-mix(in oklab, var(--background) 86%, transparent)" } : undefined}
        >
          {children}
        </div>
      </div>
    </header>
  );
}
