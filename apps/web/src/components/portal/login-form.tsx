"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { formatPhone } from "@/lib/phone";

/** Sign in with a mobile number: type the number, then the 6-digit code that came by SMS. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ phone: string; dev: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);
  useEffect(() => {
    if (sent) codeBox.current?.focus();
  }, [sent]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as { error?: string; retryAfterSec?: number | null; dev?: boolean; phone?: string; retry?: number } };
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/portal/otp/send", { phone });
    setBusy(false);
    if (!ok) {
      if (json.retryAfterSec) setWait(json.retryAfterSec);
      return setError(json.error ?? "The code could not be sent.");
    }
    setSent({ phone: json.phone ?? phone, dev: Boolean(json.dev) });
    setCode("");
    setWait(json.retryAfterSec ?? 60);
  };

  const verify = async (value: string) => {
    if (!sent || busy) return;
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/portal/otp/verify", { phone: sent.phone, code: value });
    if (!ok) {
      setBusy(false);
      setCode("");
      return setError(json.error ?? "That code is not right.");
    }
    notify.success("You are signed in.");
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="sheet marks mx-auto flex w-full max-w-sm flex-col gap-5 p-7">
      <div>
        <h1 className="text-2xl">Sign in</h1>
        <p className="text-sm text-muted-foreground">{sent ? `We sent a 6-digit code to ${formatPhone(sent.phone)}.` : "Use your mobile number. We will send you a code by SMS."}</p>
      </div>
      {!sent ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Mobile number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" autoFocus placeholder="01712345678" maxLength={20} aria-invalid={Boolean(error)} className="h-11 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <button type="submit" disabled={busy || phone.trim().length < 10 || wait > 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg cta text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {wait > 0 ? `Wait ${wait}s` : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">6-digit code</span>
            <input
              ref={codeBox}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) void verify(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-invalid={Boolean(error)}
              className="h-12 rounded-lg border bg-background px-3 text-center text-2xl tracking-[0.5em] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {sent.dev ? <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Development mode: no SMS was sent. Use the code set in MIMSMS_DEV_PASS.</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <button type="submit" disabled={busy || code.length < 6} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg cta text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Verify and sign in
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setSent(null); setError(null); }} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden /> Change number</button>
            <button type="button" disabled={wait > 0 || busy} onClick={() => void send()} className="text-muted-foreground hover:text-foreground disabled:opacity-50">{wait > 0 ? `Send again in ${wait}s` : "Send again"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
