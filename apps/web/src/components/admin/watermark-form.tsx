"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SheetWatermark } from "@/components/dielines/sheet-watermark";
import { notify } from "@/lib/notify";
import { saveWatermark, type WatermarkFormState } from "@/app/doraadmin/actions";
import { DEFAULT_WATERMARK_STYLE, DEFAULT_WATERMARK_TEXT, WATERMARK_FONT_RANGE, WATERMARK_LINE_RANGE, WATERMARK_TEXT_MAX, watermarkStyle, watermarkText, type WatermarkSettings } from "@/lib/watermark-settings";

const HEX = /^#[0-9a-fA-F]{6}$/;
const input = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

/** A colour as a picker plus its code. */
function ColorField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Follow the picker (and a reset); a half-typed code is kept until it is valid.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`Pick: ${label}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 cursor-pointer rounded-lg border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50" />
        <input
          id={id}
          value={draft}
          maxLength={7}
          disabled={disabled}
          aria-invalid={draft.length > 1 && !HEX.test(draft)}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          className={`${input} w-28 font-mono aria-invalid:border-destructive`}
        />
      </div>
    </div>
  );
}

/** A number with a slider, both bound to the same value. */
function SizeField({ id, label, unit, value, range, disabled, onChange }: { id: string; label: string; unit: string; value: number; range: { min: number; max: number; step: number }; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">({unit})</span>
      </label>
      <div className="flex items-center gap-3">
        <input type="range" aria-label={`${label}, slider`} {...range} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
        <input id={id} type="number" {...range} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className={`${input} w-20`} />
      </div>
    </div>
  );
}

/** Watermark on/off, its text, colours, letter size and line thickness, with a preview that follows. */
export function WatermarkForm({ initial }: { initial: WatermarkSettings }) {
  const [state, action, pending] = useActionState<WatermarkFormState, FormData>(saveWatermark, { ok: false, message: null });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "wm-save" });
    else notify.error(state.message, { id: "wm-save" });
  }, [state]);
  const [s, setS] = useState<WatermarkSettings>(initial);
  const set = <K extends keyof WatermarkSettings>(k: K, v: WatermarkSettings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const shown = watermarkText(s);
  const off = !s.enabled;

  // Submitted by hand rather than with `action=`: React resets a form after an action, which would untick the checkbox.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData();
    data.set("enabled", s.enabled ? "on" : "off");
    data.set("text", s.text);
    data.set("textColor", s.textColor);
    data.set("lineColor", s.lineColor);
    data.set("fontSize", String(s.fontSize));
    data.set("lineWidth", String(s.lineWidth));
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Show a watermark on the dieline sheet
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="wm-text" className="text-sm font-medium">Watermark text</label>
        <input id="wm-text" value={s.text} maxLength={WATERMARK_TEXT_MAX} disabled={off} placeholder={DEFAULT_WATERMARK_TEXT} onChange={(e) => set("text", e.target.value)} className={input} />
        <p className="text-xs text-muted-foreground">Leave it empty to use {DEFAULT_WATERMARK_TEXT}. Up to {WATERMARK_TEXT_MAX} characters.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ColorField id="wm-text-color" label="Text colour" value={s.textColor} disabled={off} onChange={(v) => set("textColor", v)} />
        <ColorField id="wm-line-color" label="Line colour" value={s.lineColor} disabled={off} onChange={(v) => set("lineColor", v)} />
        <SizeField id="wm-font" label="Font size" unit="mm" value={s.fontSize} range={WATERMARK_FONT_RANGE} disabled={off} onChange={(v) => set("fontSize", v)} />
        <SizeField id="wm-line" label="Line thickness" unit="mm, 0 = no lines" value={s.lineWidth} range={WATERMARK_LINE_RANGE} disabled={off} onChange={(v) => set("lineWidth", v)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div aria-label="Preview" className="relative aspect-[3/1] w-full overflow-hidden rounded-xl border bg-white">
          {shown ? <SheetWatermark bounds={{ width: 240, height: 80 }} text={shown} style={watermarkStyle(s)} /> : <p className="grid h-full place-items-center text-sm text-muted-foreground">No watermark</p>}
        </div>
        <button
          type="button"
          disabled={off}
          onClick={() => setS((cur) => ({ ...cur, ...DEFAULT_WATERMARK_STYLE }))}
          className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          Reset colours, size and thickness
        </button>
      </div>

      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${state.ok ? "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save watermark"}</Button>
      </div>
    </form>
  );
}
