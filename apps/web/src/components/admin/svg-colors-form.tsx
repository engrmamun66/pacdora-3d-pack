"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { saveSvgColors, type SvgColorsFormState } from "@/app/doraadmin/actions";
import { COLOR_ROLES, type SvgColorSettings } from "@/lib/svg-colors";
import { ROLE_COLOR, ROLE_HINTS, ROLE_LABELS } from "@/lib/template-import";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** One role on a single line: name, its colours as removable chips, and a compact add control. */
function RoleRow({
  role,
  colors,
  onAdd,
  onRemove,
}: {
  role: (typeof COLOR_ROLES)[number];
  colors: string[];
  onAdd: (c: string) => void;
  onRemove: (c: string) => void;
}) {
  const [draft, setDraft] = useState("#");
  const valid = HEX.test(draft);
  const add = () => {
    if (!valid) return;
    onAdd(draft.toLowerCase());
    setDraft("#");
  };
  const id = `svgc-${role}`;
  return (
    <li className="grid items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
      <div className="flex items-center gap-2" title={ROLE_HINTS[role]}>
        <span className="size-3 shrink-0 rounded-full" style={{ background: ROLE_COLOR[role] }} aria-hidden />
        <h3 className="text-sm font-medium">{ROLE_LABELS[role]}</h3>
        <span className="sr-only">{ROLE_HINTS[role]}</span>
      </div>

      {colors.length ? (
        <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label={`${ROLE_LABELS[role]} colours`}>
          {colors.map((c) => (
            <li key={c} className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-0.5 pl-1.5 text-xs">
              <span className="size-3.5 rounded-full border" style={{ background: c }} aria-hidden />
              <span className="font-mono">{c}</span>
              <button
                type="button"
                aria-label={`Remove ${c} from ${ROLE_LABELS[role]}`}
                onClick={() => onRemove(c)}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Automatic</p>
      )}

      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`Pick a ${ROLE_LABELS[role]} colour`}
          value={valid ? draft : "#000000"}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-9 cursor-pointer rounded-md border bg-background p-0.5"
        />
        <label htmlFor={id} className="sr-only">Colour code for {ROLE_LABELS[role]}</label>
        <input
          id={id}
          value={draft}
          maxLength={7}
          placeholder="#e6007e"
          onChange={(e) => setDraft(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-invalid={draft.length > 1 && !valid}
          className="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-xs aria-invalid:border-destructive"
        />
        <Button type="button" variant="outline" size="sm" disabled={!valid} onClick={add}>
          Add
        </Button>
      </div>
    </li>
  );
}

/** Colours that mean Cut, Fold, Bleed, Guide or Ignore in an imported SVG dieline. */
export function SvgColorsForm({ initial }: { initial: SvgColorSettings }) {
  const [state, action, pending] = useActionState<SvgColorsFormState, FormData>(saveSvgColors, { ok: false, message: null });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "svgc-save" });
    else notify.error(state.message, { id: "svgc-save" });
  }, [state]);
  const [colors, setColors] = useState<SvgColorSettings>(initial);

  // A colour has one meaning: adding it to a role takes it out of any other.
  const add = (role: (typeof COLOR_ROLES)[number], c: string) =>
    setColors((cur) => {
      const next = { ...cur };
      for (const r of COLOR_ROLES) next[r] = cur[r].filter((x) => x !== c);
      next[role] = [...next[role], c];
      return next;
    });
  const remove = (role: (typeof COLOR_ROLES)[number], c: string) => setColors((cur) => ({ ...cur, [role]: cur[role].filter((x) => x !== c) }));

  return (
    <form action={action} className="flex max-w-4xl flex-col gap-4">
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
        {COLOR_ROLES.map((role) => (
          <RoleRow key={role} role={role} colors={colors[role]} onAdd={(c) => add(role, c)} onRemove={(c) => remove(role, c)} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">&quot;Automatic&quot; means no colour is set: the importer&apos;s own guess is used for that kind of line.</p>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${state.ok ? "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save colours"}</Button>
      </div>
    </form>
  );
}
