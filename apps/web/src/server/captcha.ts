import "server-only";
import { env } from "./env";

/**
 * Server-side Cloudflare Turnstile check for non-auth endpoints (the auth
 * routes use the Better Auth captcha plugin). Fails closed: any error, timeout
 * or missing token means "not verified".
 */
export async function verifyCaptcha(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
