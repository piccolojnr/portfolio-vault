import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, silentRefresh } from "./token";
import { attachTokenCookies, ORG_COOKIES } from "./cookies";
import { isAuthPage, isPublicPage, isMemberBlocked } from "./routes";

function rewriteToApp(
  request: NextRequest,
  pathname: string,
  newAccess?: string | null,
  newRefresh?: string | null,
): NextResponse {
  const internalPath = `/app${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.rewrite(new URL(internalPath, request.url));
  if (newAccess) attachTokenCookies(response, newAccess, newRefresh ?? null, ORG_COOKIES);
  return response;
}

export async function handleAppDomain(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse> {
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

  // Auth & public pages — no login required, just rewrite
  if (isAuthPage(pathname) || isPublicPage(pathname)) {
    if (isAuthPage(pathname) && payload?.email_verified) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return rewriteToApp(request, pathname, newAccess, newRefresh);
  }

  // Everything below requires authentication
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!payload.email_verified) {
    return NextResponse.redirect(new URL("/auth/verify?pending=1", request.url));
  }

  if (!payload.onboarding_completed_at && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (payload.onboarding_completed_at && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const internalPath = `/app${pathname === "/" ? "" : pathname}`;
  if (payload.role === "member" && isMemberBlocked(internalPath)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return rewriteToApp(request, pathname, newAccess, newRefresh);
}
