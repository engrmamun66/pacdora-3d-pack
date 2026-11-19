import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { usesSignInBox } from "@/lib/session-ended";

/**
 * Optimistic redirect only: checks that a session COOKIE exists. Real
 * verification happens on the server in pages and actions (requireUser).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/doraadmin")) {
    // Admin area: the login page is public, everything else needs a session cookie (the real
    // super-admin check happens on the server in requireSuperAdmin()).
    if (path === "/doraadmin/login" || getSessionCookie(request)) return NextResponse.next();
    return NextResponse.redirect(new URL("/doraadmin/login", request.url));
  }
  if (!getSessionCookie(request)) {
    // A server action from a page with its own sign-in box (Dieline, Online design): the action itself answers "session ended".
    if (request.headers.has("next-action") && usesSignInBox(path)) return NextResponse.next();
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/doraadmin/:path*", "/doraadmin", "/dashboard/:path*", "/my-dashboard/:path*", "/projects/:path*", "/templates/:path*", "/template/:path*", "/editor/:path*"],
};
