"use client";

import type { ReactNode } from "react";

/**
 * Tells every feature card where the pointer is (as --mx / --my on the card), so the card's soft light can follow it.
 * One listener on the grid; nothing happens on touch screens or without a pointer.
 */
export function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const card = (e.target as HTMLElement).closest<HTMLElement>(".bento-card");
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}
