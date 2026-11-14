"use client";

import { windowPolygon, type WindowSpec } from "@packaging/dieline-engine";

/** A closed polygon as an SVG path (mm). */
export const polyD = (pts: readonly { x: number; y: number }[]) => `M${pts.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join("L")}Z`;

/**
 * The dieline as a small read-only picture, for the side bar while the 3D box has the centre.
 * Windows can be marked on it (blue, red when one does not fit) and chosen by a click; or the whole picture is a
 * button (`onOpen`) that brings the dieline back to the centre.
 */
export function MiniSheet({
  box,
  src,
  windows = [],
  problemOf,
  selected = null,
  onSelect,
  onOpen,
  onHoverMm,
  highlight = null,
}: {
  box: { minX: number; minY: number; width: number; height: number };
  src: string;
  windows?: readonly WindowSpec[];
  problemOf?: ReadonlyMap<string, string>;
  selected?: string | null;
  onSelect?: (id: string) => void;
  onOpen?: () => void;
  /** Called with the sheet point (mm) under the mouse, and null when it leaves; absent = not tracked. */
  onHoverMm?: (p: { x: number; y: number } | null) => void;
  /** A panel outline (sheet mm) drawn softly over the picture (the panel that blinks on the 3D box). */
  highlight?: readonly { x: number; y: number }[] | null;
}) {
  const picture = (
    <svg
      viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
      className="max-h-72 w-full select-none"
      role="img"
      aria-label="Dieline overview"
      {...(onHoverMm
        ? {
            onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
              const m = e.currentTarget.getScreenCTM();
              if (!m) return;
              const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
              onHoverMm({ x: pt.x, y: pt.y });
            },
            onPointerLeave: () => onHoverMm(null),
          }
        : {})}
    >
      <image href={src} x={box.minX} y={box.minY} width={box.width} height={box.height} preserveAspectRatio="none" />
      {highlight && highlight.length >= 3 ? <polygon points={highlight.map((q) => `${q.x},${q.y}`).join(" ")} fill="#2f6bff" fillOpacity={0.22} stroke="#2f6bff" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" className="hover-pulse" /> : null}
      {windows.map((w) => {
        const bad = problemOf?.has(w.id) ?? false;
        return (
          <path
            key={w.id}
            d={polyD(windowPolygon(w))}
            fill={bad ? "#dc2626" : "#2563eb"}
            fillOpacity={0.25}
            stroke={bad ? "#dc2626" : "#2563eb"}
            strokeWidth={w.id === selected ? 2.4 : 1.2}
            vectorEffect="non-scaling-stroke"
            className={onSelect ? "cursor-pointer" : ""}
            onClick={onSelect ? () => onSelect(w.id) : undefined}
          />
        );
      })}
    </svg>
  );
  return (
    <section aria-label="Dieline" className="rounded-2xl border bg-white p-2">
      {onOpen ? (
        <button type="button" onClick={onOpen} title="Show the dieline" aria-label="Show the dieline" className="block w-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {picture}
        </button>
      ) : (
        picture
      )}
    </section>
  );
}
