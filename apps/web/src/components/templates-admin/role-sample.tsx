"use client";

import { useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import type { Role } from "@packaging/svg-import";
import { Button } from "@/components/ui/button";
import { ROLE_COLOR, ROLE_HINTS, ROLE_LABELS, ROLE_ORDER } from "@/lib/template-import";

/** What each role looks like, in plain words. */
const EXPLAIN: Record<Role, string> = {
  cut: "The knife goes through here: the outer outline and any slits or holes. Every template needs at least one Cut style.",
  crease: "The sheet is folded here (dashed fold lines, also called creases). Not cut.",
  bleed: "Print area just outside the cut line, so colour reaches the edge after trimming. Shown dashed, not cut.",
  guide: "Helper lines such as the safe area inside a panel. For reference only, never cut or folded.",
  ignore: "Anything else in the file (registration marks, notes, stray lines). Left out completely.",
};

const ARROW = "#3f3f46";

/** A label chip with an arrow pointing at the part of the drawing it names. */
function Callout({ role, x, y, w = 72, from, to }: { role: Role; x: number; y: number; w?: number; from: [number, number]; to: [number, number] }) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={ARROW} strokeWidth="1.6" markerEnd="url(#arrow)" />
      <rect x={x} y={y} width={w} height="28" rx="14" fill="#fff" stroke={ROLE_COLOR[role]} strokeWidth="2.5" />
      <text x={x + w / 2} y={y + 19} textAnchor="middle" fontSize="14" fontWeight="600" fill="#18181b">{ROLE_LABELS[role]}</text>
    </g>
  );
}

/** A tiny made-up carton dieline (not a real template) with one example of every role. */
function SampleDrawing() {
  const dash = (r: Role, d: string) => ({ stroke: ROLE_COLOR[r], strokeDasharray: d });
  return (
    <svg viewBox="0 0 680 400" role="img" aria-label="Sample flat carton with its cut, fold, bleed, guide and ignored lines labelled" className="w-full rounded-lg border bg-white">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={ARROW} />
        </marker>
      </defs>

      {/* Bleed: dashed rectangle around everything */}
      <rect x="112" y="82" width="378" height="226" fill="none" strokeWidth="1.6" {...dash("bleed", "7 5")} />

      {/* Guide: safe area inside one panel */}
      <rect x="318" y="148" width="64" height="94" fill="none" strokeWidth="1.8" {...dash("guide", "2 4")} />

      {/* Crease: fold lines */}
      <g fill="none" strokeWidth="1.8" strokeDasharray="8 5" stroke={ROLE_COLOR.crease}>
        <path d="M230 140V250M310 140V250M390 140V250M150 155V235M230 140H310M230 250H310" />
      </g>

      {/* Cut: the outline, solid */}
      <path
        d="M150 140H230V105L240 100H300L310 105V140H470V250H310V285L300 290H240L230 285V250H150V235L130 228V162L150 155Z"
        fill="#fdf2f8"
        fillOpacity="0.6"
        stroke={ROLE_COLOR.cut}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* re-draw creases over the fill so they stay visible */}
      <g fill="none" strokeWidth="1.8" strokeDasharray="8 5" stroke={ROLE_COLOR.crease}>
        <path d="M230 140V250M310 140V250M390 140V250M150 155V235M230 140H310M230 250H310" />
      </g>

      {/* Ignore: a registration mark that is not part of the box */}
      <g fill="none" stroke={ROLE_COLOR.ignore} strokeWidth="2">
        <circle cx="580" cy="100" r="12" />
        <path d="M558 100H602M580 78V122" />
      </g>

      <Callout role="bleed" x={20} y={26} from={[56, 54]} to={[113, 83]} />
      <Callout role="guide" x={500} y={26} from={[536, 54]} to={[384, 150]} />
      <Callout role="ignore" x={544} y={160} from={[580, 160]} to={[580, 125]} />
      <Callout role="crease" x={520} y={262} w={80} from={[520, 276]} to={[392, 216]} />
      <Callout role="cut" x={56} y={346} w={64} from={[120, 350]} to={[258, 292]} />
    </svg>
  );
}

/** "Sample" button that opens a picture explaining Cut, Fold, Bleed, Guide and Ignore. */
export function RoleSampleButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement | null>(null);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <HelpCircle className="size-4" aria-hidden /> Sample
      </Button>
      {open ? (
        <dialog
          ref={(el) => {
            ref.current = el;
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
          aria-labelledby="role-sample-title"
          className="m-auto max-h-[92dvh] w-[min(760px,calc(100vw-24px))] overflow-auto rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
        >
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 id="role-sample-title" className="font-semibold">What do Cut, Fold, Bleed, Guide and Ignore mean?</h2>
            <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={() => ref.current?.close()}>
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              A dieline file is just lines. Each kind of line (colour and dash) in your file gets one role. Here is a made-up carton laid flat, with every role marked:
            </p>
            <SampleDrawing />
            <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
              {ROLE_ORDER.map((r) => (
                <div key={r} className="contents">
                  <dt className="flex items-center gap-2 font-medium">
                    <span className="inline-block h-1 w-6 rounded" style={{ background: ROLE_COLOR[r] }} aria-hidden />
                    {ROLE_LABELS[r]}
                  </dt>
                  <dd className="text-muted-foreground"><span className="text-foreground">{ROLE_HINTS[r]}.</span> {EXPLAIN[r]}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Tip: the colours here are the ones used in the preview. If a style is guessed wrong, change its role from the list on the left and watch the preview update.</p>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
