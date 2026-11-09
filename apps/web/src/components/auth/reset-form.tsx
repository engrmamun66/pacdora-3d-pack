"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { authClient } from "@/lib/auth-client";
import { Field, FormError } from "./field";

const MIN_PASSWORD = 10;

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token || linkError) {
    return (
      <p className="text-sm">
        This reset link is invalid or has expired. <Link className="underline" href="/forgot-password">Request a new one</Link>.
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (newPassword !== String(form.get("confirm"))) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword, token: token! });
    setBusy(false);
    if (err) setError(err.code === "INVALID_TOKEN" ? "This reset link is invalid or has expired." : (err.message ?? "Reset failed."));
    else {
      setDone(true);
      notify.success("Password changed", { description: "All other sessions were signed out." });
    }
  }

  if (done) {
    return (
      <p className="text-sm">
        Password changed. All other sessions were signed out. <Link className="underline" href="/login">Log in</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={`New password (min. ${MIN_PASSWORD} characters)`} id="password" type="password" autoComplete="new-password" required />
      <Field label="Confirm new password" id="confirm" type="password" autoComplete="new-password" required />
      <FormError message={error} />
      <Button type="submit" className="h-10 w-full" disabled={busy}>{busy ? "Saving…" : "Set new password"}</Button>
    </form>
  );
}
