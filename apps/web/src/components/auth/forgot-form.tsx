"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { authClient, captchaHeaders } from "@/lib/auth-client";
import { Field, FormError } from "./field";
import { Turnstile } from "./turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "./use-captcha";

export function ForgotForm() {
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!captcha.token) return setError("Please complete the human verification.");
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
      fetchOptions: { headers: captchaHeaders(captcha.token) },
    });
    captcha.reset();
    setBusy(false);
    if (err?.status === 429) return setError("Too many requests. Please wait a few minutes.");
    if (err && err.status !== 400 && err.status !== 404) return setError(err.message ?? "Request failed.");
    // Same message whether or not the account exists (no account enumeration).
    setDone(true);
    notify.info("Check your inbox", { description: "If an account exists for that email, a reset link is on its way." });
  }

  if (done) return <p className="text-sm">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</p>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" id="email" type="email" autoComplete="email" required />
      <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
      <FormError message={error ?? captcha.error} />
      <Button type="submit" className="h-10 w-full" disabled={busy || !captcha.token}>{busy ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
