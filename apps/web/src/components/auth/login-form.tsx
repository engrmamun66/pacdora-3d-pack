"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient, captchaHeaders } from "@/lib/auth-client";
import { Field, FormError } from "./field";
import { GoogleButton, OrDivider } from "./google-button";
import { Turnstile } from "./turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "./use-captcha";

export function LoginForm({ next, googleEnabled, initialError }: { next: string; googleEnabled: boolean; initialError?: string | null }) {
  const router = useRouter();
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!captcha.token) return setError("Please complete the human verification.");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await authClient.signIn.email({
      email,
      password: String(form.get("password")),
      callbackURL: next,
      fetchOptions: { headers: captchaHeaders(captcha.token) },
    });
    captcha.reset();
    setBusy(false);
    if (!err) {
      router.push(next);
      router.refresh();
      return;
    }
    if (err.code === "EMAIL_NOT_VERIFIED") {
      setUnverifiedEmail(email);
      setError("Please confirm your email first. Check your inbox for the link.");
    } else if (err.status === 429) {
      setError("Too many attempts. Please wait a minute and try again.");
    } else {
      setError(err.code === "INVALID_EMAIL_OR_PASSWORD" ? "Email or password is incorrect." : (err.message ?? "Sign-in failed."));
    }
  }

  async function resend() {
    if (!unverifiedEmail || !captcha.token) return setError("Complete the human verification, then click resend.");
    const { error: err } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: next,
      fetchOptions: { headers: captchaHeaders(captcha.token) },
    });
    captcha.reset();
    if (err) setError(err.message ?? "Could not resend the email.");
    else setNotice("Confirmation email sent again.");
  }

  return (
    <>
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" id="email" type="email" autoComplete="email" required />
        <Field label="Password" id="password" type="password" autoComplete="current-password" required />
        <div className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">Forgot password?</Link>
        </div>
        <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
        <FormError message={error ?? captcha.error} />
        {notice ? <p role="status" className="rounded-lg border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p> : null}
        {unverifiedEmail ? (
          <Button type="button" variant="outline" className="h-10 w-full" onClick={resend}>Resend confirmation email</Button>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={busy || !captcha.token}>{busy ? "Signing in…" : "Log in"}</Button>
      </form>
    </>
  );
}
