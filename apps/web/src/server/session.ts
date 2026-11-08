import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Session for this request (deduplicated per render). Null when signed out. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/**
 * Signed-in user or redirect to /login. Call inside a Suspense boundary
 * (cacheComponents) and again in every server action; the proxy check is only
 * an optimistic shortcut.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}
