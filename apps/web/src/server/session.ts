import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Session for this request (deduplicated per render). Null when signed out.
 * `connection()` first: checking a session reads the clock (expiry), which Next only allows once the render is known to be per request.
 */
export const getSession = cache(async () => {
  await connection();
  return auth.api.getSession({ headers: await headers() });
});

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

/**
 * Signed-in user, or null (no redirect). For server actions of pages with their own sign-in box (Dieline, Online design):
 * the action answers SESSION_ENDED_MESSAGE and the page asks the person to log in again, right where they are.
 */
export async function getActionUser() {
  const session = await getSession();
  return session?.user ?? null;
}
