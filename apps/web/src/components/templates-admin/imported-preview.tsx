"use client";

import { useMemo } from "react";
import type { ImportedDieline, Role } from "@packaging/svg-import";
import { ROLE_COLOR, pathData } from "@/lib/template-import";

/**
 * An imported dieline drawn as SVG (millimetres). With `animate`, cut lines draw
 * themselves and crease lines fade in; change `replayKey` to play it again.
 */
export function ImportedPreview({
  dieline,
  roles,
  animate = false,
  replayKey = 0,
  className,
}: {
  dieline: ImportedDieline;
  roles: Record<string, Role>;
  animate?: boolean;
  replayKey?: number;
  className?: string;
}) {
  const pad = Math.max(dieline.widthMm, dieline.heightMm) * 0.03;
  const sw = Math.max(dieline.widthMm, dieline.heightMm) / 450;
  const drawn = useMemo(
    () =>
      dieline.paths
        .map((p) => ({ role: roles[p.style] ?? "ignore", d: pathData(p.pts, p.closed) }))
        .filter((p) => p.role !== "ignore"),
    [dieline, roles],
  );
  const order: Role[] = ["bleed", "guide", "crease", "cut"]; // cut on top
  return (
    <svg
      key={replayKey}
      viewBox={`${-pad} ${-pad} ${dieline.widthMm + 2 * pad} ${dieline.heightMm + 2 * pad}`}
      className={className}
      role="img"
      aria-label={`Dieline preview, ${dieline.widthMm.toFixed(0)} by ${dieline.heightMm.toFixed(0)} millimetres`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {order.map((role) => (
        <g key={role} stroke={ROLE_COLOR[role]} strokeWidth={role === "cut" ? sw * 1.4 : sw}>
          {drawn
            .filter((p) => p.role === role)
            .map((p, i) =>
              animate && role === "cut" ? (
                <path key={i} d={p.d} pathLength={1} className="draw-line" />
              ) : animate && role === "crease" ? (
                <path key={i} d={p.d} pathLength={1} className="draw-line-crease" />
              ) : (
                <path key={i} d={p.d} strokeDasharray={role === "cut" ? undefined : `${sw * 4} ${sw * 2}`} />
              ),
            )}
        </g>
      ))}
    </svg>
  );
}
