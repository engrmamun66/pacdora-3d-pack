"use client";

import { setBanned } from "@/app/doraadmin/actions";

/** Suspend / restore with an explicit confirmation. Suspending asks for an optional reason (kept for the team). */
export function BanButton({ userId, email, banned }: { userId: string; email: string; banned: boolean }) {
  return (
    <form
      action={setBanned}
      onSubmit={(e) => {
        const form = e.currentTarget;
        if (banned) {
          if (!window.confirm(`Restore ${email}? They will be able to sign in again.`)) e.preventDefault();
          return;
        }
        const reason = window.prompt(`Suspend ${email}? They are signed out everywhere and cannot sign in.\n\nReason (optional, max 200 characters):`);
        if (reason === null) return e.preventDefault();
        (form.elements.namedItem("reason") as HTMLInputElement).value = reason.slice(0, 200);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="ban" value={banned ? "0" : "1"} />
      <input type="hidden" name="reason" defaultValue="" />
      <button
        type="submit"
        className={`rounded-md border px-2.5 py-1 text-xs font-medium ${banned ? "hover:bg-muted" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}
      >
        {banned ? "Restore" : "Suspend"}
      </button>
    </form>
  );
}
