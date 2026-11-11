"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { saveHeroSettings, type HeroFormState } from "@/app/doraadmin/actions";
import { DEFAULT_BOX_COLOR, HERO_POSITIONS, type HeroSettings } from "@/lib/hero-settings";

const FALLBACK_COLOR = "#f4f4f2";
const HEX = /^#[0-9a-fA-F]{6}$/;

interface ColourValue {
  useDefault: boolean;
  color: string;
}

/** "Use default" checkbox plus colour picker, hex field and swatch. */
function ColourField({
  legend,
  hint,
  defaultLabel,
  name,
  defaultName,
  value,
  onChange,
}: {
  legend: string;
  hint: string;
  defaultLabel: string;
  name: string;
  defaultName: string;
  value: ColourValue;
  onChange: (v: ColourValue) => void;
}) {
  const valid = HEX.test(value.color);
  const hintId = `${name}-hint`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={defaultName} value="1" checked={value.useDefault} onChange={(e) => onChange({ ...value, useDefault: e.target.checked })} />
        {defaultLabel}
      </label>
      <div className={`flex items-center gap-3 ${value.useDefault ? "opacity-50" : ""}`}>
        <input
          type="color"
          aria-label={`${legend} picker`}
          disabled={value.useDefault}
          value={valid ? value.color : FALLBACK_COLOR}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
          className="h-10 w-14 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed"
        />
        <input
          name={name}
          aria-label={`${legend} as hex`}
          disabled={value.useDefault}
          value={value.color}
          maxLength={7}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
          aria-invalid={!value.useDefault && !valid}
          className="h-10 w-32 rounded-lg border border-input bg-background px-3 font-mono text-sm aria-invalid:border-destructive"
        />
        <span className="size-10 rounded-lg border" style={{ background: value.useDefault ? "linear-gradient(135deg,#fff,#eee)" : valid ? value.color : "transparent" }} aria-hidden />
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}

/** Choose where the hero box starts and the hero background colour. */
export function HeroSettingsForm({ initial, templates }: { initial: HeroSettings; templates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<HeroFormState, FormData>(saveHeroSettings, { ok: false, message: null });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "hero-save" });
    else notify.error(state.message, { id: "hero-save" });
  }, [state]);
  const [position, setPosition] = useState(initial.initial);
  const [templateId, setTemplateId] = useState(initial.templateId ?? "");
  const [bg, setBg] = useState<ColourValue>({ useDefault: initial.background === null, color: initial.background ?? FALLBACK_COLOR });
  const [panel, setPanel] = useState<ColourValue>({ useDefault: initial.boxBackground === null, color: initial.boxBackground ?? "#e9ecff" });
  const [boxColor, setBoxColor] = useState<ColourValue>({ useDefault: initial.boxColor === null, color: initial.boxColor ?? DEFAULT_BOX_COLOR });
  const colourOk = (v: ColourValue) => v.useDefault || HEX.test(v.color);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="hero-template" className="text-sm font-medium">Template shown in the 3D view</label>
        <select
          id="hero-template"
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          aria-describedby="hero-template-hint"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">Default (straight tuck end box)</option>
          {/* A template that was hidden since it was chosen stays in the list, so saving does not silently change it. */}
          {templateId && !templates.some((t) => t.id === templateId) ? <option value={templateId}>{templateId} (no longer available)</option> : null}
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <p id="hero-template-hint" className="text-xs text-muted-foreground">
          The box that folds and unfolds in the home page hero. Only published templates with a 3D view are listed. If the chosen template is hidden or loses its 3D view later, the home page shows the default box.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hero-initial" className="text-sm font-medium">Box initial position</label>
        <select
          id="hero-initial"
          name="initial"
          value={position}
          onChange={(e) => setPosition(e.target.value as HeroSettings["initial"])}
          aria-describedby="hero-initial-hint"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          {HERO_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <p id="hero-initial-hint" className="text-xs text-muted-foreground">
          {HERO_POSITIONS.find((p) => p.value === position)?.hint} The animation starts from here, and visitors who prefer reduced motion see this pose.
        </p>
      </div>

      <ColourField
        legend="Background colour"
        hint="Whole hero section. Text and menu switch to light or dark automatically so they stay readable."
        defaultLabel="Use the default look (soft gradient)"
        name="background"
        defaultName="useDefaultBackground"
        value={bg}
        onChange={setBg}
      />

      <ColourField
        legend="Box colour"
        hint="The colour of the animated box itself (its outside). Pick a colour that differs from the panel behind it."
        defaultLabel={`Use the default indigo (${DEFAULT_BOX_COLOR})`}
        name="boxColor"
        defaultName="useDefaultBoxColor"
        value={boxColor}
        onChange={setBoxColor}
      />

      <ColourField
        legend="Animation box background"
        hint="A rounded panel behind the animated box. Leave on default to let the hero background show through."
        defaultLabel="No panel (use the hero background)"
        name="boxBackground"
        defaultName="useDefaultBoxBackground"
        value={panel}
        onChange={setPanel}
      />

      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${state.ok ? "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" className="h-10" disabled={pending || !colourOk(bg) || !colourOk(panel) || !colourOk(boxColor)}>{pending ? "Saving…" : "Save"}</Button>
        <a href="/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Open home page</a>
      </div>
    </form>
  );
}
