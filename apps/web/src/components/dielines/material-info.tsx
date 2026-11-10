"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Info, X } from "lucide-react";

const MATERIALS = [
  {
    name: "Corrugated fiberboard",
    image: "/materials/corrugated-fiberboard.webp",
    text: "Corrugated fiberboard is a material consisting of a fluted corrugated sheet and one or two flat linerboards. It is made on \"flute lamination machines\" or \"corrugators\" and is used for making cardboard boxes. The corrugated medium sheet and the linerboard(s) are made of kraft containerboard, a paperboard material usually over 0.01 inches (0.25 mm) thick. Corrugated fiberboard is sometimes called 'corrugated cardboard', although cardboard might be any heavy paper-pulp based board.",
  },
  {
    name: "White card paper",
    image: "/materials/white-card-paper.webp",
    text: "White cardboard paper is a kind of cardboard with white and smooth front and gray background on the back. This kind of cardboard is mainly used for single-sided color printing and then made into cartons for packaging, or for design and handmade products.",
  },
  {
    name: "White cardboard paper",
    image: "/materials/white-cardboard-paper.webp",
    text: "White cardboard paper is a kind of cardboard with white and smooth front and gray background on the back. This kind of cardboard is mainly used for single-sided color printing and then made into cartons for packaging, or for design and handmade products.",
  },
  {
    name: "Kraft paper",
    image: "/materials/kraft-paper.webp",
    text: "Kraft paper is a tough, water-resistant packaging paper that is brownish-yellow and has a wide range of uses. The main quality requirements are flexibility and firmness, high burst resistance, and can withstand greater tension and pressure without breaking.",
  },
  {
    name: "Coated paper",
    image: "/materials/coated-paper.webp",
    text: "Coated paper (also known as enamel paper, gloss paper, and slick paper) is paper that has been coated by a mixture of materials or a polymer to impart certain qualities to the paper, including weight, surface gloss, smoothness, or reduced ink absorbency. Various materials, including kaolinite, calcium carbonate, bentonite, and talc, can be used to coat paper for high-quality printing used in the packaging industry and in magazines. The chalk or china clay is bound to the paper with synthetic viscosifiers, such as styrene-butadiene latexes and natural organic binders such as starch. The coating formulation may also contain chemical additives as dispersants, resins, or polyethylene to give water resistance and wet strength to the paper, or to protect against ultraviolet radiation.",
  },
] as const;

const CLOSE_MS = 200;

/** Small info icon next to the Material heading. It opens a dialog describing each board material. */
export function MaterialInfoButton() {
  const [open, setOpen] = useState(false);
  // `shown` drives the fade/scale: false while mounting and while closing.
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDialogElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    // Two frames, so the browser paints the hidden state before it transitions to the shown one.
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Fade out first, then really close the dialog. */
  const close = () => {
    if (timer.current) return;
    setShown(false);
    timer.current = setTimeout(() => {
      timer.current = null;
      ref.current?.close();
    }, CLOSE_MS);
  };
  return (
    <>
      <button
        type="button"
        aria-label="About the materials"
        title="About the materials"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Info className="size-4" aria-hidden />
      </button>
      {open ? (
        <dialog
          ref={(el) => {
            ref.current = el;
            if (el && !el.open) el.showModal();
          }}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onClose={() => {
            setOpen(false);
            setShown(false);
          }}
          onClick={(e) => {
            if (e.target === ref.current) close();
          }}
          aria-labelledby="material-info-title"
          className={`m-auto max-h-[90dvh] w-[min(1000px,calc(100vw-24px))] overflow-auto rounded-xl border bg-background p-0 text-foreground shadow-xl transition duration-200 ease-out backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-200 motion-reduce:transition-none motion-reduce:backdrop:transition-none ${shown ? "translate-y-0 scale-100 opacity-100 backdrop:opacity-100" : "translate-y-3 scale-95 opacity-0 backdrop:opacity-0"}`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-3">
            <h2 id="material-info-title" className="font-semibold">About the materials</h2>
            <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={close}>
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col divide-y">
            {MATERIALS.map((m) => (
              <section key={m.name} className="flex flex-col gap-3 p-5 sm:flex-row">
                <Image src={m.image} alt={`${m.name} sample`} width={400} height={300} className="h-auto w-full shrink-0 rounded-lg border object-cover sm:w-40" />
                <div className="min-w-0">
                  <h3 className="font-medium">{m.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                </div>
              </section>
            ))}
          </div>
        </dialog>
      ) : null}
    </>
  );
}
