"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { MAX_DESCRIPTION_CHARS } from "@packaging/ai-contract/limits";
import { suggestBox, type SuggestResponse } from "@/app/(app)/templates/ai-actions";
import { Turnstile } from "@/components/auth/turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "@/components/auth/use-captcha";

/** "Describe your box": the AI proposes a template and dimensions; the engine validates them. */
export function AiDescribe() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<SuggestResponse | null>(null);
  const [pending, start] = useTransition();
  const captcha = useCaptcha();

  const submit = () =>
    start(async () => {
      const r = await suggestBox(text, captcha.token ?? "");
      captcha.reset(); // tokens are single-use
      setRes(r);
    });

  const result = res?.ok ? res.result : null;
  return (
    <section className="rounded-xl border bg-muted/20 p-4" aria-labelledby="ai-describe-title">
      <h2 id="ai-describe-title" className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4" /> Describe your box
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        For example: &ldquo;Tuck end box for a perfume bottle, inside 60 x 60 x 140 mm, 0.4 mm board&rdquo;. AI suggests a template and sizes; every value is then checked by the dieline engine.
      </p>
      <label htmlFor="ai-text" className="sr-only">Box description</label>
      <textarea
        id="ai-text"
        className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
        maxLength={MAX_DESCRIPTION_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What do you want to pack, and how big is it?"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim() || !captcha.token}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Suggest"}
        </button>
        <span className="text-xs text-muted-foreground">{text.length}/{MAX_DESCRIPTION_CHARS}</span>
      </div>

      {res && !res.ok ? (
        <p role="alert" className="mt-3 text-sm text-destructive">{res.message}</p>
      ) : null}

      {res?.ok && result ? (
        <div role="status" className="mt-3 flex gap-4 rounded-lg border bg-background p-3">
          {res.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={res.thumbnail} alt="" className="h-28 w-36 shrink-0 object-contain" />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            {result.kind === "ok" ? (
              <>
                <p className="font-medium">{res.presetName}</p>
                <p className="text-muted-foreground">
                  {String(result.params.width)} x {String(result.params.depth)} x {String(result.params.height)} mm ({result.params.sizeMode === "inner" ? "inside size" : "crease-to-crease"})
                </p>
                <Link
                  className="w-fit rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted"
                  href={`/template/dieline/${encodeURIComponent(result.presetId)}?p=${encodeURIComponent(JSON.stringify(result.params))}`}
                >
                  Open in designer
                </Link>
              </>
            ) : result.kind === "invalid" ? (
              <>
                <p className="font-medium">The suggestion did not pass the dieline checks{res.presetName ? ` (${res.presetName})` : ""}:</p>
                <ul className="list-disc pl-5 text-destructive">
                  {result.issues.slice(0, 5).map((i) => (
                    <li key={i.path + i.message}>{i.path}: {i.message}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{result.message}</p>
            )}
            {result.notes.length ? (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">AI suggestions left today: {res.remaining}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
