import { useId } from "react";
import { DEFAULT_WATERMARK_STYLE, DEFAULT_WATERMARK_TEXT, type WatermarkStyle } from "@/lib/watermark-settings";

/** The watermark text used when none is given. */
export const DEFAULT_WATERMARK = DEFAULT_WATERMARK_TEXT;

/**
 * One repeat (mm): two rows, the second shifted half a tile, so the text forms a diagonal grid.
 * It grows with the letters, so bigger text never runs into its neighbours.
 */
export function watermarkTile(text: string, fontSize: number): { w: number; h: number } {
  const scale = fontSize / DEFAULT_WATERMARK_STYLE.fontSize;
  return { w: Math.max(48 * scale, text.length * fontSize * 0.6 + 12 * scale), h: 30 * scale };
}

/**
 * A faint tiled text behind the dieline, like Pacdora's free-plan sheet. It is drawn in sheet millimetres, so it
 * scales and pans with the sheet; `bounds` is the size of the picture it sits under.
 */
export function SheetWatermark({
  bounds,
  text = DEFAULT_WATERMARK,
  style = DEFAULT_WATERMARK_STYLE,
  clip,
}: {
  /** The picture's rectangle in sheet millimetres (`minX`, `minY` default to 0). */
  bounds: { width: number; height: number; minX?: number; minY?: number };
  text?: string;
  /** Colours, letter size and line thickness. */
  style?: WatermarkStyle;
  /** SVG path data (sheet millimetres) of the area the watermark may cover: the cut outline. Whole picture when absent. */
  clip?: string;
}) {
  const id = `wm-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const clipId = `${id}-clip`;
  const [x0, y0] = [bounds.minX ?? 0, bounds.minY ?? 0];
  if (!text.trim()) return null;
  const { w, h } = watermarkTile(text, style.fontSize);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full select-none"
      viewBox={`${x0} ${y0} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse">
          {/* the diagonal lattice; its lines cross in the tile's middle and at its four corners */}
          {style.lineWidth > 0 ? (
            <g stroke={style.lineColor} strokeOpacity="0.4" strokeWidth={style.lineWidth}>
              <line x1="0" y1="0" x2={w} y2={h} />
              <line x1="0" y1={h} x2={w} y2="0" />
            </g>
          ) : null}
          {/* one text on every crossing; the corner ones are split across the tile edges and join up again */}
          {[
            [w / 2, h / 2],
            [0, 0],
            [w, 0],
            [0, h],
            [w, h],
          ].map(([x, y]) => (
            <text
              key={`${x}-${y}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={style.fontSize}
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill={style.textColor}
              fillOpacity="0.55"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth={style.fontSize / 4}
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
