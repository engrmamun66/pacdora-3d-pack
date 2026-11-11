import { useId } from "react";

/** The watermark text used when none is given. */
export const DEFAULT_WATERMARK = "pacdorabd.com";

/** Size of one repeat (mm): two rows, the second shifted half a tile, so the text forms a diagonal grid. */
const TILE_W = 48;
const TILE_H = 30;
const FONT_MM = 3.6;

/**
 * A faint tiled text behind the dieline, like Pacdora's free-plan sheet. It is drawn in sheet millimetres, so it
 * scales and pans with the sheet; `bounds` is the size of the picture it sits under.
 */
export function SheetWatermark({
  bounds,
  text = DEFAULT_WATERMARK,
  clip,
}: {
  /** The picture's rectangle in sheet millimetres (`minX`, `minY` default to 0). */
  bounds: { width: number; height: number; minX?: number; minY?: number };
  text?: string;
  /** SVG path data (sheet millimetres) of the area the watermark may cover: the cut outline. Whole picture when absent. */
  clip?: string;
}) {
  const id = `wm-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clipId = `${id}-clip`;
  const [x0, y0] = [bounds.minX ?? 0, bounds.minY ?? 0];
  if (!text.trim()) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full select-none"
      viewBox={`${x0} ${y0} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
          {/* the diagonal lattice; its lines cross in the tile's middle and at its four corners */}
          <g stroke="#6b7280" strokeOpacity="0.4" strokeWidth="0.25">
            <line x1="0" y1="0" x2={TILE_W} y2={TILE_H} />
            <line x1="0" y1={TILE_H} x2={TILE_W} y2="0" />
          </g>
          {/* one text on every crossing; the corner ones are split across the tile edges and join up again */}
          {[
            [TILE_W / 2, TILE_H / 2],
            [0, 0],
            [TILE_W, 0],
            [0, TILE_H],
            [TILE_W, TILE_H],
          ].map(([x, y]) => (
            <text
              key={`${x}-${y}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={FONT_MM}
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill="#6b7280"
              fillOpacity="0.55"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth="0.9"
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {text}
            </text>
          ))}
        </pattern>
      </defs>
      {clip ? (
        <clipPath id={clipId}>
          <path d={clip} clipRule="evenodd" />
        </clipPath>
      ) : null}
      <rect x={x0} y={y0} width={bounds.width} height={bounds.height} fill={`url(#${id})`} {...(clip ? { clipPath: `url(#${clipId})` } : {})} />
    </svg>
  );
}
