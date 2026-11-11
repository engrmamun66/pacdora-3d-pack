"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notify";
import { Field, FormError } from "@/components/auth/field";

const MIN = 10;

/** Change the signed-in admin's own password. Other devices are signed out. */
export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current"));
    const next = String(data.get("next"));
    setDone(false);
    if (next.length < MIN) return setError(`New password must be at least ${MIN} characters.`);
    if (next !== String(data.get("confirm"))) return setError("The new passwords do not match.");
    if (next === current) return setError("Choose a password different from the current one.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (err) {
      const msg = err.status === 429 ? "Too many attempts. Please wait a minute." : "The current password is incorrect, or the new one was rejected.";
      notify.error("Password not changed", { description: msg });
      return setError(msg);
    }
    form.reset();
    setDone(true);
    notify.success("Password changed", { description: "Other devices were signed out." });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <Field label="Current password" id="current" type="password" autoComplete="current-password" required />
      <Field label={`New password (min. ${MIN} characters)`} id="next" type="password" autoComplete="new-password" required />
      <Field label="Confirm new password" id="confirm" type="password" autoComplete="new-password" required />
      <FormError message={error} />
      {done ? <p role="status" className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">Password changed. Other devices were signed out.</p> : null}
      <Button type="submit" className="h-10" disabled={busy}>{busy ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
