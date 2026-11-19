import { googleEnabled } from "@/server/env";
import { SessionGuard } from "./session-guard";

/** Put this on a page that must never leave for /login (and render it only for a signed-in person): it opens the sign-in box when the session ends. */
export function SessionGuardHost({ email }: { email: string }) {
  return <SessionGuard email={email} googleEnabled={googleEnabled} />;
}
