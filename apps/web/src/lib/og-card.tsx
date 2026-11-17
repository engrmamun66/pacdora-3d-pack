import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * The picture shown when a link to the site is shared (1200 x 630): the name, the tagline and a dieline of a box drawn
 * in the dieline colours. Drawn here, so there is nothing to upload; Settings > SEO can name a picture of your own instead.
 */
export function ogCard(name: string, tagline: string): ImageResponse {
  const cut = "#e0227a";
  const crease = "#2aa0e0";
  const line = (style: Record<string, string | number>) => <div style={{ position: "absolute", display: "flex", ...style }} />;
  const box = { position: "absolute" as const, display: "flex", border: `3px solid ${cut}`, background: "rgba(232,207,159,0.9)" };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0e1a2e", color: "#ffffff", padding: 72, fontFamily: "sans-serif", overflow: "hidden" }}>
        {[...Array(15)].map((_, i) => line({ left: i * 80, top: 0, width: 1, height: 630, background: "rgba(255,255,255,0.07)" }))}
        {[...Array(8)].map((_, i) => line({ top: i * 80, left: 0, height: 1, width: 1200, background: "rgba(255,255,255,0.07)" }))}
        <div style={{ position: "absolute", right: 70, top: 110, width: 430, height: 400, display: "flex" }}>
          <div style={{ ...box, left: 160, top: 0, width: 110, height: 90 }} />
          <div style={{ ...box, left: 60, top: 90, width: 100, height: 210 }} />
          <div style={{ ...box, left: 160, top: 90, width: 110, height: 210 }} />
          <div style={{ ...box, left: 270, top: 90, width: 100, height: 210 }} />
          <div style={{ ...box, left: 160, top: 300, width: 110, height: 90 }} />
          {line({ left: 60, top: 90, width: 310, height: 0, borderTop: `3px dashed ${crease}` })}
          {line({ left: 60, top: 300, width: 310, height: 0, borderTop: `3px dashed ${crease}` })}
          {line({ left: 160, top: 90, width: 0, height: 210, borderLeft: `3px dashed ${crease}` })}
          {line({ left: 270, top: 90, width: 0, height: 210, borderLeft: `3px dashed ${crease}` })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 14, background: cut, marginRight: 16 }} />
            {name}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 68, lineHeight: 1.05, fontWeight: 800, letterSpacing: -2 }}>Dielines that fold in 3D</div>
            <div style={{ display: "flex", marginTop: 26, fontSize: 28, lineHeight: 1.35, color: "rgba(255,255,255,0.72)" }}>{tagline}</div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
