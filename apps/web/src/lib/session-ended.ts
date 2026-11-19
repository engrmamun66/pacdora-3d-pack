/**
 * Pages with their own sign-in box (the Dieline page and the Online design page): when the session ends there, the page never
 * goes to /login. A server action answers with SESSION_ENDED_MESSAGE, and the page opens the sign-in box over its work.
 */

export const SESSION_ENDED_MESSAGE = "Your session has ended. Log in again to continue.";

/** Browser event that asks the page's session guard to check the session now. */
export const SESSION_CHECK_EVENT = "session:check";

/** The paths that show a sign-in box instead of going to /login (the Dieline page, a saved project's Dieline page, the Online design page). */
export const usesSignInBox = (path: string) => path.startsWith("/editor/") || path.startsWith("/template/dieline/") || path.startsWith("/projects/");

export function requestSessionCheck() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_CHECK_EVENT));
}
