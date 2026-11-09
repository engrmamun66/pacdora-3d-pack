"use client";

import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient, captchaHeaders } from "@/lib/auth-client";
import { Field, FormError } from "./field";
import { GoogleButton, OrDivider } from "./google-button";
import { Turnstile } from "./turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "./use-captcha";

const MIN_PASSWORD = 10;

/** Rough guide only (length and variety). The server enforces the real minimum. */
function strength(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: "" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < MIN_PASSWORD) return { level: 1, label: `Too short (${pw.length}/${MIN_PASSWORD})` };
  if (pw.length >= 14 && kinds >= 3) return { level: 3, label: "Strong" };
  return kinds >= 2 ? { level: 2, label: "Good" } : { level: 1, label: "Weak: add numbers or capitals" };
}

function StrengthMeter({ password }: { password: string }) {
  const s = strength(password);
  const colors = ["bg-border", "bg-red-500", "bg-amber-500", "bg-green-600"];
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${s.level >= i ? colors[s.level] : "bg-border"}`} />
        ))}
      </div>
      <span className="w-40 text-xs text-muted-foreground">{s.label || `At least ${MIN_PASSWORD} characters`}</span>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (!name) return setError("Please enter your name.");
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== String(form.get("confirm"))) return setError("Passwords do not match.");
    if (!captcha.token) return setError("Please complete the human verification.");

    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/dashboard",
      fetchOptions: { headers: captchaHeaders(captcha.token) },
    });
    captcha.reset();
    setBusy(false);
    if (!err) return setSentTo(email);
    if (err.status === 429) setError("Too many attempts. Please wait a minute and try again.");
    else if (err.code?.startsWith("USER_ALREADY_EXISTS")) setError("An account with this email already exists. Try logging in.");
    else setError(err.message ?? "Registration failed.");
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-xl border bg-muted/40 p-5 text-sm">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><MailCheck className="size-5" aria-hidden /></span>
        <p className="font-medium">Check your inbox</p>
        <p className="text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>. Open it to activate your account. The link expires in 1 hour.
        </p>
      </div>
    );
  }

  return (
    <>
      {googleEnabled ? (
        <>
          <GoogleButton next="/dashboard" />
          <OrDivider />
        </>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" id="name" autoComplete="name" required />
        <Field label="Email" id="email" type="email" autoComplete="email" required />
        <Field label="Password" id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint={<StrengthMeter password={password} />} />
        <Field label="Confirm password" id="confirm" type="password" autoComplete="new-password" required />
        <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
        <FormError message={error ?? captcha.error} />
        <Button type="submit" className="h-10 w-full" disabled={busy || !captcha.token}>{busy ? "Creating account…" : "Create account"}</Button>
      </form>
    </>
  );
}
