"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SESSION_CHECK_EVENT } from "@/lib/session-ended";
import { LoginForm } from "./login-form";

const POLL_MS = 30_000;

/**
 * For pages that must never leave for /login (the Dieline page, the Online design page). When the signed-in person's session
 * ends, this opens the sign-in page's whole form (email, Google, human check, forgot password) in a modal over the page, which
 * keeps its place and its unsaved work. The page behind is inert, and the box cannot be closed, until they log in again.
 * Only the account that was signed in may come back (the page belongs to it). Mount it only when someone is signed in.
 */
export function SessionGuard({ email, googleEnabled }: { email: string; googleEnabled: boolean }) {
  const [ended, setEnded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [here, setHere] = useState("/");

  const check = useCallback(async () => {
    try {
      const { data, error } = await authClient.getSession({ query: { disableCookieCache: true } });
      if (error && error.status !== 401) return; // a network problem is not a sign-out
      if (!data) setEnded(true);
    } catch {
      /* offline: try again at the next check */
    }
  }, []);

  useEffect(() => {
    const now = () => void check();
    const visible = () => document.visibilityState === "visible" && now();
    const timer = window.setInterval(visible, POLL_MS);
    window.addEventListener("focus", now);
    window.addEventListener("online", now);
    window.addEventListener(SESSION_CHECK_EVENT, now);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", now);
      window.removeEventListener("online", now);
      window.removeEventListener(SESSION_CHECK_EVENT, now);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (ended && !d.open) {
      setHere(location.pathname + location.search);
      d.showModal();
    }
    if (!ended && d.open) d.close();
  }, [ended]);

  /** Signed in again: only the same account may continue (another one would find this page's project missing). */
  const done = async () => {
    const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
    if (data && data.user.email.toLowerCase() !== email.toLowerCase()) {
      await authClient.signOut();
      return `This page belongs to ${email}. Log in with that account.`;
    }
    setEnded(false);
    return null;
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="session-ended-title"
      // Not closable: Escape is ignored, and a click on the backdrop does nothing.
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {ended ? (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1.5">
            <span className="grid size-9 place-items-center rounded-full bg-muted"><LockKeyhole className="size-4" aria-hidden /></span>
            <h2 id="session-ended-title" className="mt-1 text-xl font-semibold">Your session has ended</h2>
            <p className="text-sm text-muted-foreground">Log in again to continue. This page stays as it is, and your work is kept.</p>
          </div>
          <div className="flex flex-col gap-4">
            <LoginForm next={here} googleEnabled={googleEnabled} onDone={done} newTabLinks />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            No account? <Link href="/register" target="_blank" rel="noopener" className="underline">Create one</Link>
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
