import "server-only";
import { env } from "./env";

/**
 * CSRF guard for cookie-authenticated route handlers (server actions have
 * their own check). Browsers always send Origin on cross-site POST/DELETE.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(env.BETTER_AUTH_URL).origin;
}
