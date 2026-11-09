"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient, captchaHeaders } from "@/lib/auth-client";
import { confirmAdminSession } from "@/app/doraadmin/actions";
import { Field, FormError } from "@/components/auth/field";
import { Turnstile } from "@/components/auth/turnstile";
import { TURNSTILE_SITE_KEY, useCaptcha } from "@/components/auth/use-captcha";

/** Email + password + captcha. Every failure shows the same message so the form reveals nothing about accounts. */
export function AdminLoginForm() {
  const router = useRouter();
  const captcha = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const GENERIC = "Email or password is incorrect.";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!captcha.token) return setError("Please complete the human verification.");
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      fetchOptions: { headers: captchaHeaders(captcha.token) },
    });
    captcha.reset();
    if (err) {
      setBusy(false);
      return setError(err.status === 429 ? "Too many attempts. Please wait a minute and try again." : GENERIC);
    }
    const isAdmin = await confirmAdminSession().catch(() => false);
    setBusy(false);
    if (!isAdmin) return setError(GENERIC);
    router.push("/doraadmin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" id="email" type="email" autoComplete="username" required />
      <Field label="Password" id="password" type="password" autoComplete="current-password" required />
      <Turnstile resetKey={captcha.resetKey} siteKey={TURNSTILE_SITE_KEY} onToken={captcha.onToken} onError={captcha.onError} />
      <FormError message={error ?? captcha.error} />
      <Button type="submit" className="h-10 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
