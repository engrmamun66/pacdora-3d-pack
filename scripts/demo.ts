import { mkdirSync, writeFileSync } from "node:fs";
import { generateDieline } from "@packaging/dieline-engine";
import { renderDielineSvg } from "@packaging/render-svg";

mkdirSync("out", { recursive: true });
for (const variant of ["straight", "reverse"] as const) {
  const geo = generateDieline("tuck-end-carton", { variant, width: 100, depth: 50, height: 150 });
  const file = `out/tuck-end-${variant}.svg`;
  writeFileSync(file, renderDielineSvg(geo, { showPanelLabels: true }));
  const w = geo.cutBounds.max.x - geo.cutBounds.min.x;
  const h = geo.cutBounds.max.y - geo.cutBounds.min.y;
  console.log(`${file}: sheet ${w.toFixed(2)} x ${h.toFixed(2)} mm, checks ${geo.checks.filter((c) => c.pass).length}/${geo.checks.length} pass`);
  if (geo.unverifiedDefaultsUsed.length) console.log(`  unverified defaults used: ${geo.unverifiedDefaultsUsed.join(", ")}`);
}
