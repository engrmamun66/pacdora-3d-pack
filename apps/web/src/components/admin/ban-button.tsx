"use client";

import { useTransition } from "react";
import { setBanned } from "@/app/doraadmin/actions";
import { notify } from "@/lib/notify";

/** Suspend / restore with an explicit confirmation. Suspending asks for an optional reason (kept for the team). */
export function BanButton({ userId, email, banned }: { userId: string; email: string; banned: boolean }) {
  const [pending, start] = useTransition();

  function run() {
    let reason = "";
    if (banned) {
      if (!window.confirm(`Restore ${email}? They will be able to sign in again.`)) return;
    } else {
      const r = window.prompt(`Suspend ${email}? They are signed out everywhere and cannot sign in.\n\nReason (optional, max 200 characters):`);
      if (r === null) return;
      reason = r.slice(0, 200);
    }
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("ban", banned ? "0" : "1");
    fd.set("reason", reason);
    start(async () => {
      try {
        const res = await setBanned(fd);
        if (!res.ok) notify.error(res.message);
        else if (banned) notify.success(`${email} restored`, { description: res.message });
        else notify.warning(`${email} suspended`, { description: res.message });
      } catch {
        notify.error("Could not complete the action. Please try again.");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={run}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${banned ? "hover:bg-muted" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}
    >
      {pending ? "Working…" : banned ? "Restore" : "Suspend"}
    </button>
  );
}
