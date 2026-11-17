import type { CSSProperties } from "react";
import { PackBox } from "@/components/studio/pack-box";
import type { FeatureVisual } from "@/lib/site-content";

/** A dieline that draws its cut lines, then its creases and its three measurements, and starts again. */
function DielineVisual() {
  return (
    <svg viewBox="0 0 300 190" fill="none" className="h-full max-h-44 w-auto" aria-hidden>
      <g stroke="var(--cut)" strokeWidth="1.6" strokeLinejoin="round">
        <path pathLength={1} className="fv-draw" d="M92 14h52v40H92z" />
        <path pathLength={1} className="fv-draw" d="M58 54h34v96H58zM92 54h52v96H92zM144 54h52v96h-52zM196 54h40v96h-40z" />
        <path pathLength={1} className="fv-draw" d="M92 150h52v30H92z" />
        <path pathLength={1} className="fv-draw" d="M236 62l14 5v70l-14 5" />
      </g>
      <g stroke="var(--crease)" strokeWidth="1.4" strokeDasharray="5 4" className="fv-fade">
        <path d="M92 54h144M92 150h144M92 54v96M144 54v96M196 54v96" />
      </g>
      <g className="fv-fade" stroke="var(--ink)" strokeWidth="1" fill="var(--ink)" fontFamily="var(--font-geist-mono), monospace" fontSize="10">
        <path d="M92 6h52M92 3v6M144 3v6" fill="none" />
        <text x="118" y="4" stroke="none" textAnchor="middle" dy="-1" fontSize="9">W</text>
        <path d="M46 54v96M43 54h6M43 150h6" fill="none" />
        <text x="38" y="105" stroke="none" textAnchor="middle" fontSize="9">H</text>
        <path d="M144 162h52M144 159v6M196 159v6" fill="none" />
        <text x="170" y="176" stroke="none" textAnchor="middle" fontSize="9">D</text>
      </g>
    </svg>
  );
}

/** Three sheets one above the other: the board, the artwork, and the cut lines. They drift apart and together. */
function LayersVisual() {
  const plane = "60,8 120,38 60,68 0,38";
  const lift = (v: number) => ({ "--lift": `${v}px` }) as CSSProperties;
  return (
    <svg viewBox="-10 -14 140 150" fill="none" className="h-full max-h-40 w-auto" aria-hidden>
      {/* The CSS motion replaces an SVG transform, so each sheet is placed by an outer group and moved by an inner one. */}
      <g transform="translate(0 48)">
        <g className="fv-layer" style={lift(10)}>
          <polygon points={plane} fill="var(--board)" stroke="var(--board-deep)" strokeWidth="1.2" />
        </g>
      </g>
      <g transform="translate(0 24)">
        <g className="fv-layer" style={lift(0)}>
          <polygon points={plane} fill="oklch(1 0 0 / 0.86)" stroke="var(--crease)" strokeWidth="1.2" strokeDasharray="4 3" />
          <circle cx="52" cy="38" r="9" fill="var(--cut)" opacity="0.85" />
          <path d="M68 34l22 11M66 40l16 8" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
        </g>
      </g>
      <g className="fv-layer" style={lift(-12)}>
        <polygon points={plane} fill="oklch(1 0 0 / 0.5)" stroke="var(--cut)" strokeWidth="1.6" />
        <path d="M30 23l60 30M90 23L30 53" stroke="var(--cut)" strokeWidth="1" opacity="0.5" />
      </g>
    </svg>
  );
}

/** A request being typed, and what comes back. */
function PromptVisual() {
  const text = "a mailer box for two candles";
  return (
    <div className="flex w-full max-w-xs flex-col gap-2.5 font-mono text-xs" aria-hidden>
      <div className="rounded-lg border bg-card px-3 py-2.5 shadow-xs">
        <span className="text-[var(--cut)]">&gt; </span>
        <span className="fv-type align-bottom" style={{ "--n": text.length } as CSSProperties}>{text}</span>
      </div>
      <div className="fv-answer flex flex-wrap gap-1.5">
        {["template", "W × D × H", "checked"].map((c) => <span key={c} className="rounded-full border border-[var(--crease)]/50 bg-[var(--crease)]/10 px-2 py-0.5">{c}</span>)}
      </div>
    </div>
  );
}

/** Three files fanned out; they spread a little more when the card is hovered. */
function FilesVisual() {
  const files = [
    { label: "PDF", r: "-14deg", y: "6px", tone: "var(--cut)" },
    { label: "AI", r: "0deg", y: "-6px", tone: "var(--board-deep)" },
    { label: "DXF", r: "14deg", y: "6px", tone: "var(--crease)" },
  ];
  return (
    <div className="flex items-end justify-center" aria-hidden>
      {files.map((f, i) => (
        <div key={f.label} className={`fv-file relative flex h-24 w-[4.5rem] origin-bottom flex-col justify-end rounded-lg border bg-card p-2 shadow-md ${i ? "-ml-4" : ""}`} style={{ "--r": f.r, "--y": f.y, zIndex: i === 1 ? 2 : 1 } as CSSProperties}>
          <span className="absolute top-0 right-0 size-4 rounded-tr-lg rounded-bl-md" style={{ background: `linear-gradient(225deg, var(--paper) 50%, ${f.tone} 50%)` }} />
          <span className="mb-2 flex flex-col gap-1">
            <span className="h-0.5 w-8 rounded bg-muted-foreground/25" />
            <span className="h-0.5 w-10 rounded bg-muted-foreground/25" />
            <span className="h-0.5 w-6 rounded bg-muted-foreground/25" />
          </span>
          <span className="font-mono text-xs font-semibold" style={{ color: f.tone }}>{f.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Three checks, ticked one after the other. */
function CheckVisual() {
  const rows = ["Closed cut path", "No overlaps", "Folds close"];
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 font-mono text-xs" aria-hidden>
      {rows.map((r, i) => (
        <li key={r} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-xs">
          <svg viewBox="0 0 20 20" className="size-4" fill="none">
            <circle cx="10" cy="10" r="9" stroke="var(--crease)" strokeWidth="1.5" strokeDasharray="3 2.5" />
            <path pathLength={1} className="fv-tick" style={{ "--d": `${i * 0.5}s` } as CSSProperties} d="M5.5 10.5l3 3 6-7" stroke="var(--cut)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {r}
        </li>
      ))}
    </ul>
  );
}

/** The small moving picture of one feature card. Decoration only: it is hidden from screen readers. */
export function FeaturePicture({ visual }: { visual: FeatureVisual }) {
  switch (visual) {
    case "dieline":
      return <DielineVisual />;
    case "layers":
      return <LayersVisual />;
    case "box":
      return <PackBox w={58} h={82} d={42} />;
    case "prompt":
      return <PromptVisual />;
    case "files":
      return <FilesVisual />;
    case "check":
      return <CheckVisual />;
    default:
      return null;
  }
}
