"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Shows its content when it scrolls into view, once: `fold` tips it up from the sheet like a panel being folded,
 * `rise` lifts it a little. The motion itself is CSS ([data-reveal] in globals.css) and is off for reduced motion.
 * Without JavaScript the home page shows everything at once (a <noscript> style there).
 */
export function Reveal({ children, variant = "rise", delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; variant?: "fold" | "rise"; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-in", "");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const style = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;
  // One element type per use; the ref is the same HTMLElement either way.
  return (
    <Tag ref={ref as never} data-reveal={variant} className={className} style={style}>
      {children}
    </Tag>
  );
}
