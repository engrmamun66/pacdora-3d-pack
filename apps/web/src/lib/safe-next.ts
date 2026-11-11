/**
 * Only allow same-site relative paths as post-login destinations (prevents open
 * redirects). Control characters and backslashes are rejected anywhere: browsers
 * strip tabs/newlines and treat "\" as "/", so "/<tab>/evil.com" would become "//evil.com".
 */
export function safeNext(raw: string | null | undefined, fallback = "/my-dashboard"): string {
  if (!raw || raw.length > 2000 || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\u0000- \u007f\\]/.test(raw)) return fallback;
  return raw;
}
