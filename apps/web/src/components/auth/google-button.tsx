"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** "Continue with Google": same action for sign-up and sign-in. */
export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login?error=google" });
        setBusy(false);
      }}
    >
      Continue with Google
    </Button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}
