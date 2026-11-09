/**
 * Runs once when the server starts. Loading the environment here makes a
 * misconfigured deployment fail at boot (clear error, no half-working site)
 * instead of on the first request that happens to need a secret.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./server/env");
}
