"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { saveWatermark, type WatermarkFormState } from "@/app/doraadmin/actions";
import { DEFAULT_WATERMARK_TEXT, WATERMARK_TEXT_MAX, watermarkText, type WatermarkSettings } from "@/lib/watermark-settings";

/** Watermark on/off and its text, with a small preview of how it repeats. */
export function WatermarkForm({ initial }: { initial: WatermarkSettings }) {
  const [state, action, pending] = useActionState<WatermarkFormState, FormData>(saveWatermark, { ok: false, message: null });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "wm-save" });
    else notify.error(state.message, { id: "wm-save" });
  }, [state]);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [text, setText] = useState(initial.text);
  const shown = watermarkText({ enabled, text });
  // Submitted by hand rather than with `action=`: React resets a form after an action, which would untick the checkbox.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="hidden" name="enabled" value={enabled ? "on" : "off"} />
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Show a watermark on the dieline sheet
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="wm-text" className="text-sm font-medium">Watermark text</label>
        {/* A disabled field is not sent, so the text rides along here and survives switching the watermark off. */}
        <input type="hidden" name="text" value={text} />
        <input
          id="wm-text"
          value={text}
          maxLength={WATERMARK_TEXT_MAX}
          disabled={!enabled}
          placeholder={DEFAULT_WATERMARK_TEXT}
          onChange={(e) => setText(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">Leave it empty to use {DEFAULT_WATERMARK_TEXT}. Up to {WATERMARK_TEXT_MAX} characters.</p>
      </div>

      <div aria-label="Preview" className="relative h-32 overflow-hidden rounded-xl border bg-white">
        {shown ? (
          <svg aria-hidden viewBox="0 0 240 64" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
            <defs>
              <pattern id="wm-prev" width="48" height="30" patternUnits="userSpaceOnUse">
                <g stroke="#6b7280" strokeOpacity="0.4" strokeWidth="0.25">
                  <line x1="0" y1="0" x2="48" y2="30" />
                  <line x1="0" y1="30" x2="48" y2="0" />
                </g>
                {[[24, 15], [0, 0], [48, 0], [0, 30], [48, 30]].map(([x, y]) => (
                  <text key={`${x}-${y}`} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="3.6" fontWeight="600" fill="#6b7280" fillOpacity="0.55" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.9" paintOrder="stroke">
                    {shown}
                  </text>
                ))}
              </pattern>
            </defs>
            <rect width="240" height="64" fill="url(#wm-prev)" />
          </svg>
        ) : (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">No watermark</p>
        )}
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
