import { fmtLen, fmtSize, type BoxSizes, type DielineStats } from "./info-math";
import type { Unit } from "./units";

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-base tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      {title ? <h3 className="font-semibold">{title}</h3> : null}
      <dl className="flex flex-col gap-4">{children}</dl>
    </div>
  );
}

/** The Info tab: model, sizes and line lengths, as plain label and value pairs. */
export function DielineInfo({
  description,
  modelId,
  unit,
  stats,
  sizes,
  overall,
  checks,
  unverified,
}: {
  description: string;
  modelId: string;
  unit: Unit;
  stats: DielineStats | null;
  /** Null for a dieline without width, depth and height (an imported one). */
  sizes: BoxSizes | null;
  /** Overall sheet size without bleed, mm. */
  overall: { w: number; h: number } | null;
  checks: readonly { name: string; pass: boolean; detail?: string | undefined }[];
  unverified: readonly string[];
}) {
  const passed = checks.filter((c) => c.pass).length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Dieline info</h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-5 rounded-2xl border bg-muted/30 p-5">
        <Group>
          <Item label="Model ID" value={modelId} />
        </Group>
        {sizes ? (
          <Group title="Dimensions">
            <Item label="Manufacturing" value={fmtSize(sizes.manufacturing, unit)} />
            <Item label="Inner" value={fmtSize(sizes.inner, unit)} />
            <Item label="Outer" value={fmtSize(sizes.outer, unit)} />
            <p className="text-xs text-muted-foreground">Width × depth × height. Inner and outer follow the thickness allowance rule; confirm them with your printer.</p>
          </Group>
        ) : overall ? (
          <Group title="Dimensions">
            <Item label="Overall" value={fmtSize([overall.w, overall.h], unit)} />
          </Group>
        ) : null}
        {stats ? (
          <Group title="Dieline statistics">
            <Item label="Design area" value={fmtSize([stats.area.w, stats.area.h], unit)} />
            <Item label="Cut length" value={fmtLen(stats.cutLength, unit)} />
            <Item label="Crease length" value={fmtLen(stats.creaseLength, unit)} />
          </Group>
        ) : null}
      </div>

      {unverified.length > 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Built-in defaults used for: {unverified.join(", ")}. They are not from an industry standard; confirm them with your printer.
        </p>
      ) : null}
      {checks.length > 0 ? (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span>Geometry checks: {passed} of {checks.length} pass</span>
            <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            {checks.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={c.pass ? "text-green-700" : "font-semibold text-destructive"} aria-label={c.pass ? "Pass" : "Fail"}>{c.pass ? "✓" : "✗"}</span>
                <span><span className="font-medium">{c.name}</span>{c.detail ? <span className="text-muted-foreground"> — {c.detail}</span> : null}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
