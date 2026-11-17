import type { CSSProperties } from "react";

/**
 * A small box that turns slowly, made of six CSS faces (no WebGL, so it costs nothing to draw). It is the mark of the
 * site's 3D side. Sizes are in pixels; the colours are the board colour with the dieline's cut and crease lines.
 */
export function PackBox({ w = 64, h = 92, d = 44, className = "" }: { w?: number; h?: number; d?: number; className?: string }) {
  const style = { "--w": w, "--h": h, "--d": d } as CSSProperties;
  return (
    <div aria-hidden className={`pack-stage ${className}`} style={style}>
      <div className="pack-box">
        {(["front", "back", "left", "right", "top", "bottom"] as const).map((f) => <div key={f} className={`pack-face pack-${f}`} />)}
      </div>
    </div>
  );
}

/**
 * The flat sheet of a box (its dieline) drawn faintly: solid cut lines and dashed creases, in the same colours as the dieline pictures.
 * Decoration behind headings; it carries no information.
 */
export function DielineNet({ className = "" }: { className?: string }) {
  const cut = "var(--cut)";
  const crease = "var(--crease)";
  return (
    <svg aria-hidden viewBox="0 0 360 260" fill="none" className={className}>
      <g stroke={cut} strokeWidth="1.5" strokeLinejoin="round">
        <path d="M110 6h60v52h-60z" />
        <path d="M70 58h40v132H70zM110 58h60v132h-60zM170 58h60v132h-60zM230 58h44v132h-44z" />
        <path d="M110 190h60v44h-60z" />
        <path d="M274 70l18 6v108l-18 6" />
      </g>
      <g stroke={crease} strokeWidth="1.5" strokeDasharray="5 4">
        <path d="M110 58h164M110 190h164M110 58v132M170 58v132M230 58v132M70 58v132" />
      </g>
    </svg>
  );
}
