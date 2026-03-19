import { NextRequest, NextResponse } from "next/server";
import {
  isAdminDomain,
  isBypass,
  isAuthPage,
  isPublicPage,
  isAdminPublicPath,
  isAdminPublicDevPath,
  isMemberBlocked,
  DEV_ADMIN_MODE,
} from "@/middleware/routes";
import { verifyAccessToken, silentRefresh } from "@/middleware/token";
import { attachTokenCookies, ORG_COOKIES } from "@/middleware/cookies";
import { handleAdminDomain, handleAdminDevMode } from "@/middleware/admin";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // ── Admin domain ────────────────────────────────────────────────────────
  if (isAdminDomain(hostname)) {
    if (isBypass(pathname)) return NextResponse.next();
    if (isAdminPublicPath(pathname)) {
      return NextResponse.rewrite(
        new URL(`/platform-admin${pathname === "/" ? "" : pathname}`, request.url),
      );
    }
    return handleAdminDomain(request, pathname);
  }

  // ── /platform-admin on main domain ──────────────────────────────────────
  if (pathname.startsWith("/platform-admin")) {
    if (!DEV_ADMIN_MODE) return new NextResponse(null, { status: 404 });
    if (isBypass(pathname) || isAdminPublicDevPath(pathname)) {
      return NextResponse.next();
    }
    return handleAdminDevMode(request);
  }

  // ── Normal app ──────────────────────────────────────────────────────────
  if (isBypass(pathname) || isPublicPage(pathname)) return NextResponse.next();

  const accessCookie = request.cookies.get("access_token")?.value;
  const refreshCookie = request.cookies.get("refresh_token")?.value;

  let payload = accessCookie ? await verifyAccessToken(accessCookie) : null;
  let newAccess: string | null = null;
  let newRefresh: string | null = null;

  if (!payload && refreshCookie) {
    const tokens = await silentRefresh(refreshCookie);
    if (tokens) {
      payload = await verifyAccessToken(tokens.access_token);
      newAccess = tokens.access_token;
      newRefresh = tokens.refresh_token;
    }
  }

  if (isAuthPage(pathname)) {
    if (payload?.email_verified) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!payload.email_verified && !pathname.startsWith("/auth/verify")) {
    return NextResponse.redirect(new URL("/auth/verify?pending=1", request.url));
  }

  if (!payload.onboarding_completed_at && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (payload.onboarding_completed_at && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (payload.role === "member" && isMemberBlocked(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();
  if (newAccess) {
    attachTokenCookies(response, newAccess, newRefresh, ORG_COOKIES);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icons|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.webmanifest$).*)",
  ],
};
