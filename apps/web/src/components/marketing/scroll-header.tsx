"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The home page header: it floats over the hero and stays at the top of the screen while the page
 * scrolls. Once the page has moved it gets a solid background (the hero's own colour, if one is
 * set) and a bottom border, so the sections going under it stay readable.
 */
export function ScrollHeader({ children, background }: { children: ReactNode; background: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-[background-color,box-shadow,border-color] duration-200 ${scrolled ? "border-b shadow-sm backdrop-blur" : "border-b border-transparent"}`}
      style={scrolled ? { background: background ?? "color-mix(in oklab, var(--background) 92%, transparent)" } : undefined}
    >
      {children}
    </header>
  );
}
