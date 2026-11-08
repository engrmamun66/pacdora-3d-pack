"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient, captchaHeaders } from "@/lib/auth-client";
import { Field, FormError } from "./field";
import { GoogleButton, OrDivider } from "./google-button";
import { Turnstile } from "./turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "./use-captcha";

const MIN_PASSWORD = 10;

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <p className="text-sm">
        We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account. The link expires in 1 hour.
      </p>
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
        <Field label={`Password (min. ${MIN_PASSWORD} characters)`} id="password" type="password" autoComplete="new-password" required />
        <Field label="Confirm password" id="confirm" type="password" autoComplete="new-password" required />
        <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
        <FormError message={error ?? captcha.error} />
        <Button type="submit" disabled={busy || !captcha.token}>{busy ? "Creating account…" : "Create account"}</Button>
      </form>
    </>
  );
}
