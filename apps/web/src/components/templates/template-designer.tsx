"use client";

import { useActionState, useDeferredValue, useMemo, useState } from "react";
import {
  ParamValidationError,
  getGenerator,
  type DielineGeometry,
  type ParamDescriptor,
  type ParamGroup,
} from "@packaging/dieline-engine";
import { renderDielineSvg } from "@packaging/render-svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { svgDataUrl } from "@/lib/dieline-preview";
import { createProject, updateProject, type DesignState } from "@/app/(app)/projects/actions";

type Values = Record<string, string>;
type Mode = { kind: "create"; presetId: string } | { kind: "edit"; projectId: string };

interface Props {
  mode: Mode;
  generatorId: string;
  initialName: string;
  initialParams: Record<string, unknown>;
}

const GROUP_ORDER: ParamGroup[] = ["Dimensions", "Structure", "Material", "Print", "Flaps (advanced)"];

/** Turn form strings into engine input: empty optional numbers are omitted (engine default). */
function toInput(params: readonly ParamDescriptor[], values: Values): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of params) {
    if (p.showWhen && values[p.showWhen.key] !== p.showWhen.equals) continue;
    const raw = (values[p.key] ?? "").trim();
    if (raw === "") continue;
    out[p.key] = p.kind === "number" ? Number(raw) : raw;
  }
  return out;
}

type Result = { geo: DielineGeometry; issues: null; error: null } | { geo: null; issues: { path: string; message: string }[]; error: string | null };

export function TemplateDesigner({ mode, generatorId, initialName, initialParams }: Props) {
  const gen = getGenerator(generatorId);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(gen.params.map((p) => [p.key, initialParams[p.key] === undefined ? "" : String(initialParams[p.key])])),
  );
  const [name, setName] = useState(initialName);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const deferred = useDeferredValue(values);

  const input = useMemo(() => toInput(gen.params, deferred), [gen.params, deferred]);
  const result: Result = useMemo(() => {
    try {
      return { geo: gen.generate(input), issues: null, error: null };
    } catch (e) {
      if (e instanceof ParamValidationError) return { geo: null, issues: [...e.issues], error: null };
      return { geo: null, issues: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [gen, input]);

  // Keep the last good preview on screen while the user is mid-edit.
  const [lastGood, setLastGood] = useState<DielineGeometry | null>(null);
  if (result.geo && result.geo !== lastGood) setLastGood(result.geo);
  const shown = result.geo ?? lastGood;
  const preview = useMemo(() => (shown ? svgDataUrl(renderDielineSvg(shown, { showPanelLabels: true })) : null), [shown]);

  const action = mode.kind === "create" ? createProject : updateProject;
  const [state, formAction, pending] = useActionState<DesignState, FormData>(action, { ok: false, message: null, issues: [] });

  const issueFor = (key: string) =>
    [...(result.issues ?? []), ...state.issues].find((i) => i.path === key || i.path.startsWith(`${key}.`))?.message;
  const otherIssues = (result.issues ?? []).filter((i) => !gen.params.some((p) => i.path === p.key));
  const resolved = (shown?.params ?? {}) as Record<string, unknown>;
  const size = shown ? { w: shown.cutBounds.max.x - shown.cutBounds.min.x, h: shown.cutBounds.max.y - shown.cutBounds.min.y } : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <form action={formAction} className="flex flex-col gap-5">
        {mode.kind === "create" ? <input type="hidden" name="presetId" value={mode.presetId} /> : <input type="hidden" name="projectId" value={mode.projectId} />}
        <input type="hidden" name="params" value={JSON.stringify(input)} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name">Project name</Label>
          <Input id="project-name" name="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
        </div>

        {GROUP_ORDER.map((group) => {
          const fields = gen.params.filter((p) => p.group === group && (!p.showWhen || values[p.showWhen.key] === p.showWhen.equals));
          if (fields.length === 0) return null;
          const advanced = group === "Flaps (advanced)";
          return (
            <fieldset key={group} className="flex flex-col gap-3">
              <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium">
                {group}
                {advanced ? (
                  <button type="button" className="text-xs font-normal text-muted-foreground underline" onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? "Hide" : "Show"}
                  </button>
                ) : null}
              </legend>
              {advanced && !showAdvanced
                ? null
                : fields.map((p) => (
                    <Field
                      key={p.key}
                      p={p}
                      value={values[p.key] ?? ""}
                      placeholder={
                        p.kind === "number" && typeof resolved[p.key] === "number"
                          ? `${p.optional ? "auto" : "default"} (${(resolved[p.key] as number).toFixed(2)})`
                          : undefined
                      }
                      error={issueFor(p.key)}
                      onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                    />
                  ))}
            </fieldset>
          );
        })}

        {state.message ? (
          <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>{state.message}</p>
        ) : null}
        <Button type="submit" disabled={pending || !result.geo}>
          {pending ? "Saving…" : mode.kind === "create" ? "Create project" : "Save changes"}
        </Button>
      </form>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {size ? <span>Sheet {size.w.toFixed(1)} × {size.h.toFixed(1)} mm (without bleed)</span> : null}
          {shown ? <span>Checks: {shown.checks.filter((c) => c.pass).length}/{shown.checks.length} pass</span> : null}
          {!result.geo ? <span className="text-destructive">Preview shows the last valid shape.</span> : null}
        </div>
        {result.error || otherIssues.length > 0 ? (
          <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {result.error ?? otherIssues.map((i) => `${i.path}: ${i.message}`).join("; ")}
          </div>
        ) : null}
        {shown && shown.unverifiedDefaultsUsed.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Built-in defaults used for: {shown.unverifiedDefaultsUsed.join(", ")}. They are not taken from an industry
            standard; confirm them with your printer before production.
          </div>
        ) : null}
        <div className="overflow-auto rounded-lg border bg-white p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
            <img src={preview} alt="Dieline preview" className="h-auto w-full" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Enter valid dimensions to see the dieline.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Magenta = cut, dashed blue = crease, orange = glue, dashed grey = bleed, dashed green = safe area.
        </p>
      </section>
    </div>
  );
}

function Field({ p, value, placeholder, error, onChange }: { p: ParamDescriptor; value: string; placeholder?: string; error?: string; onChange: (v: string) => void }) {
  const id = `param-${p.key}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {p.label}
        {p.kind === "number" ? <span className="text-muted-foreground"> ({p.unit === "mm" ? "mm" : "×"})</span> : null}
      </Label>
      {p.kind === "enum" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {p.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={p.min}
          max={p.max}
          step={p.step}
          value={value}
          placeholder={placeholder ?? (p.optional ? "auto" : undefined)}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : p.help ? <p className="text-xs text-muted-foreground">{p.help}</p> : null}
    </div>
  );
}
