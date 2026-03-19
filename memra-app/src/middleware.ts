import { NextRequest, NextResponse } from "next/server";
import {
  isAdminDomain,
  isAppDomain,
  isBypass,
  isMainDomainPublic,
  isAdminPublicPath,
} from "@/middleware/routes";
import { handleAdminDomain } from "@/middleware/admin";
import { handleAppDomain } from "@/middleware/app";
import { ADMIN_DOMAIN, APP_DOMAIN } from "@/lib/env";

function redirectToSubdomain(
  request: NextRequest,
  domain: string,
  path: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.hostname = domain;
  url.pathname = path;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // ── Admin subdomain ───────────────────────────────────────────────────
  if (isAdminDomain(hostname)) {
    if (isBypass(pathname)) return NextResponse.next();
    if (isAdminPublicPath(pathname)) {
      return NextResponse.rewrite(
        new URL(`/platform-admin${pathname === "/" ? "" : pathname}`, request.url),
      );
    }
    return handleAdminDomain(request, pathname);
  }

  // ── App subdomain ─────────────────────────────────────────────────────
  if (isAppDomain(hostname)) {
    if (isBypass(pathname)) return NextResponse.next();
    return handleAppDomain(request, pathname);
  }

  // ── Main domain ───────────────────────────────────────────────────────
  if (isBypass(pathname) || isMainDomainPublic(pathname)) return NextResponse.next();

  // Redirect /platform-admin/* → admin subdomain
  if (pathname.startsWith("/platform-admin") && ADMIN_DOMAIN) {
    const adminPath = pathname.replace(/^\/platform-admin/, "") || "/";
    return redirectToSubdomain(request, ADMIN_DOMAIN, adminPath);
  }

  // Redirect /app/* → app subdomain
  if (pathname.startsWith("/app") && APP_DOMAIN) {
    const appPath = pathname.replace(/^\/app/, "") || "/";
    return redirectToSubdomain(request, APP_DOMAIN, appPath);
  }

  // Everything else on the main domain → app subdomain
  if (APP_DOMAIN) {
    return redirectToSubdomain(request, APP_DOMAIN, pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icons|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.webmanifest$).*)",
  ],
};
