"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

const KINDS = [
  {
    name: "Wall / main panel",
    en: "A side of the box, or the front of a card. This is the main part of the sheet; the flaps and lids are attached to it.",
    bn: "বাক্সের একটি পাশ, অথবা কার্ডের সামনের অংশ। এটি শিটের মূল অংশ; ফ্ল্যাপ ও ঢাকনা এর সঙ্গেই যুক্ত থাকে।",
  },
  {
    name: "Lid or bottom",
    en: "A big panel that closes the top or the bottom of the box.",
    bn: "বড় প্যানেল, যা বাক্সের উপরের বা নিচের মুখ বন্ধ করে।",
  },
  {
    name: "Tuck flap",
    en: "A flap that tucks inside the box to keep the lid closed.",
    bn: "যে ফ্ল্যাপ বাক্সের ভেতরে গুঁজে দেওয়া হয়, যাতে ঢাকনা বন্ধ থাকে।",
  },
  {
    name: "Dust flap",
    en: "A small flap on the side, folded inside the box. It closes the gap beside the lid and keeps dust out.",
    bn: "পাশের ছোট ফ্ল্যাপ, যা বাক্সের ভেতরে ভাঁজ হয়। এটি ঢাকনার পাশের ফাঁক বন্ধ করে ও ধুলা ঢুকতে দেয় না।",
  },
  {
    name: "Glue flap",
    en: "The narrow strip that is glued to another panel to join the sheet into a box.",
    bn: "সরু পটি, যা অন্য প্যানেলের সঙ্গে আঠা দিয়ে লাগিয়ে শিটটিকে বাক্স বানানো হয়।",
  },
  {
    name: "Bottom flap",
    en: "The outer flap of a glued (crash-lock) bottom. It is folded last and sits on the outside.",
    bn: "আঠা-লাগানো (ক্র্যাশ-লক) তলার বাইরের ফ্ল্যাপ। এটি সবশেষে ভাঁজ হয় এবং বাইরের দিকে থাকে।",
  },
  {
    name: "Lock flap",
    en: "The inner flap of a glued (crash-lock) bottom. It locks the bottom when the box is opened.",
    bn: "আঠা-লাগানো (ক্র্যাশ-লক) তলার ভেতরের ফ্ল্যাপ। বাক্স খুললে এটি তলাকে আটকে রাখে।",
  },
] as const;

const CLOSE_MS = 200;

/** Help icon next to the panel "Kind" field. It opens a dialog that explains every kind, in English and Bangla. */
export function PanelKindHelp() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  // Which language the explanations are shown in. Kept while the page stays open.
  const [lang, setLang] = useState<"en" | "bn">("en");
  const ref = useRef<HTMLDialogElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
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
        aria-label="What do the panel kinds mean?"
        title="What do the panel kinds mean?"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CircleHelp className="size-4" aria-hidden />
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
          aria-labelledby="panel-kind-help-title"
          className={`m-auto max-h-[90dvh] w-[min(720px,calc(100vw-24px))] overflow-auto rounded-xl border bg-background p-0 text-foreground shadow-xl transition duration-200 ease-out backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-200 motion-reduce:transition-none motion-reduce:backdrop:transition-none ${shown ? "translate-y-0 scale-100 opacity-100 backdrop:opacity-100" : "translate-y-3 scale-95 opacity-0 backdrop:opacity-0"}`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-5 py-3">
            <h2 id="panel-kind-help-title" lang={lang} className="font-semibold">{lang === "en" ? "Panel kinds" : "প্যানেলের ধরন"}</h2>
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="Language" className="flex rounded-lg border bg-muted/40 p-0.5 text-sm">
                {([["en", "EN", "English"], ["bn", "BN", "বাংলা"]] as const).map(([v, short, name]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={lang === v}
                    aria-label={name}
                    title={name}
                    onClick={() => setLang(v)}
                    className={`rounded-md px-3 py-1 font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${lang === v ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {short}
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Close" className="rounded p-1 hover:bg-muted" onClick={close}>
                <X className="size-4" />
              </button>
            </div>
          </div>
          <ul className="flex flex-col divide-y" lang={lang}>
            {KINDS.map((k) => (
              <li key={k.name} className="flex flex-col gap-1 px-5 py-4">
                <h3 className="font-medium">{k.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{k[lang]}</p>
              </li>
            ))}
          </ul>
        </dialog>
      ) : null}
    </>
  );
}
