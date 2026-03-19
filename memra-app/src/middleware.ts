import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import {
  ADMIN_DOMAIN,
  ADMIN_JWT_SECRET,
  JWT_SECRET,
  RAG_BACKEND_URL,
  IS_PRODUCTION,
} from "@/lib/env";

// ── Admin domain detection ────────────────────────────────────────────────────

// In dev (ADMIN_DOMAIN unset), admin routes are accessible on any domain via
// /platform-admin/*. In production, they're only accessible on the admin domain.
const DEV_ADMIN_MODE = !ADMIN_DOMAIN;

function isAdminDomain(host: string): boolean {
  if (!ADMIN_DOMAIN) return false;
  const bare = host.replace(/:\d+$/, "");
  return bare === ADMIN_DOMAIN || bare === ADMIN_DOMAIN.replace(/:\d+$/, "");
}

// ── Bypass / Auth / Public paths ──────────────────────────────────────────────

const BYPASS_PATHS = [
  "/api/",
  "/_next/",
  "/favicon",
  "/site.webmanifest",
  "/apple-touch-icon",
];

const AUTH_PAGES = [
  "/login",
  "/register",
  "/auth/magic-link",
  "/auth/reset-password",
];

const PUBLIC_PAGES = ["/auth/invite", "/auth/verify"];

function isBypass(pathname: string): boolean {
  return BYPASS_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((prefix) => pathname.startsWith(prefix));
}

// ── Org user token verification ───────────────────────────────────────────────

interface TokenPayload extends JWTPayload {
  sub: string;
  org_id: string;
  org_name: string;
  role: string;
  email: string;
  email_verified: boolean;
  onboarding_completed_at: string | null;
  type: string;
}

async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  if (!JWT_SECRET) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const p = JSON.parse(atob(padded)) as TokenPayload;
      if (!p.sub || p.type !== "access") return null;
      if (p.exp && Date.now() / 1000 >= p.exp) return null;
      return p;
    } catch {
      return null;
    }
  }

  const secret = new TextEncoder().encode(JWT_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if ((payload as TokenPayload).type !== "access") return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

async function silentRefresh(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${RAG_BACKEND_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${refreshToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/refresh_token=([^;]+)/);
    return {
      access_token: data.access_token,
      refresh_token: match ? match[1] : refreshToken,
    };
  } catch {
    return null;
  }
}

// ── Admin token verification ──────────────────────────────────────────────────

interface AdminTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  type: "platform_admin";
}

async function verifyAdminAccessToken(
  token: string,
): Promise<AdminTokenPayload | null> {
  if (!ADMIN_JWT_SECRET) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const p = JSON.parse(atob(padded)) as AdminTokenPayload;
      if (!p.sub || p.type !== "platform_admin") return null;
      if (p.exp && Date.now() / 1000 >= p.exp) return null;
      return p;
    } catch {
      return null;
    }
  }

  const secret = new TextEncoder().encode(ADMIN_JWT_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if ((payload as AdminTokenPayload).type !== "platform_admin") return null;
    return payload as AdminTokenPayload;
  } catch {
    return null;
  }
}

async function silentAdminRefresh(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${RAG_BACKEND_URL}/api/v1/platform/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `admin_refresh_token=${refreshToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/admin_refresh_token=([^;]+)/);
    return {
      access_token: data.access_token,
      refresh_token: match ? match[1] : refreshToken,
    };
  } catch {
    return null;
  }
}

// ── Main middleware ───────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // ── Admin domain handling ────────────────────────────────────────────────

  if (isAdminDomain(hostname)) {
    // Bypass API routes and static assets on admin domain too
    if (isBypass(pathname)) return NextResponse.next();

    // Rewrite to internal /platform-admin/* path
    const internalPath = `/platform-admin${pathname === "/" ? "" : pathname}`;
    const rewriteUrl = new URL(internalPath, request.url);

    // Admin auth pages — no auth required
    const adminPublicPaths = ["/login", "/change-password"];
    if (adminPublicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.rewrite(rewriteUrl);
    }

    // Check admin access token
    const adminAccess = request.cookies.get("admin_access_token")?.value;
    const adminRefresh = request.cookies.get("admin_refresh_token")?.value;

    let adminPayload = adminAccess
      ? await verifyAdminAccessToken(adminAccess)
      : null;
    let newAdminAccess: string | null = null;
    let newAdminRefresh: string | null = null;

    if (!adminPayload && adminRefresh) {
      const tokens = await silentAdminRefresh(adminRefresh);
      if (tokens) {
        adminPayload = await verifyAdminAccessToken(tokens.access_token);
        newAdminAccess = tokens.access_token;
        newAdminRefresh = tokens.refresh_token;
      }
    }

    if (!adminPayload) {
      const loginUrl = new URL("/platform-admin/login", request.url);
      return NextResponse.rewrite(loginUrl);
    }

    const response = NextResponse.rewrite(rewriteUrl);

    if (newAdminAccess) {
      response.cookies.set("admin_access_token", newAdminAccess, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
        maxAge: 60 * 15,
      });
      if (newAdminRefresh) {
        response.cookies.set("admin_refresh_token", newAdminRefresh, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: IS_PRODUCTION,
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }

    return response;
  }

  // ── /platform-admin on main domain ───────────────────────────────────────

  if (pathname.startsWith("/platform-admin")) {
    // In production (ADMIN_DOMAIN is set), block admin routes on main domain.
    if (!DEV_ADMIN_MODE) {
      return new NextResponse(null, { status: 404 });
    }

    // Dev mode: serve admin routes directly on any domain.
    if (isBypass(pathname)) return NextResponse.next();

    const adminPublicPaths = ["/platform-admin/login", "/platform-admin/change-password"];
    if (adminPublicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next();
    }

    const adminAccess = request.cookies.get("admin_access_token")?.value;
    const adminRefresh = request.cookies.get("admin_refresh_token")?.value;

    let adminPayload = adminAccess
      ? await verifyAdminAccessToken(adminAccess)
      : null;
    let newAdminAccess: string | null = null;
    let newAdminRefresh: string | null = null;

    if (!adminPayload && adminRefresh) {
      const tokens = await silentAdminRefresh(adminRefresh);
      if (tokens) {
        adminPayload = await verifyAdminAccessToken(tokens.access_token);
        newAdminAccess = tokens.access_token;
        newAdminRefresh = tokens.refresh_token;
      }
    }

    if (!adminPayload) {
      return NextResponse.redirect(new URL("/platform-admin/login", request.url));
    }

    const response = NextResponse.next();
    if (newAdminAccess) {
      response.cookies.set("admin_access_token", newAdminAccess, {
        httpOnly: false, sameSite: "lax", path: "/", secure: IS_PRODUCTION, maxAge: 60 * 15,
      });
      if (newAdminRefresh) {
        response.cookies.set("admin_refresh_token", newAdminRefresh, {
          httpOnly: true, sameSite: "lax", path: "/", secure: IS_PRODUCTION, maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
    return response;
  }

  // ── Normal app middleware (unchanged) ────────────────────────────────────

  if (isBypass(pathname) || isPublicPage(pathname)) return NextResponse.next();

  const accessCookie = request.cookies.get("access_token")?.value;
  const refreshCookie = request.cookies.get("refresh_token")?.value;

  let payload = accessCookie ? await verifyAccessToken(accessCookie) : null;
  let newAccessToken: string | null = null;
  let newRefreshToken: string | null = null;

  if (!payload && refreshCookie) {
    const tokens = await silentRefresh(refreshCookie);
    if (tokens) {
      payload = await verifyAccessToken(tokens.access_token);
      newAccessToken = tokens.access_token;
      newRefreshToken = tokens.refresh_token;
    }
  }

  if (isAuthPage(pathname)) {
    if (payload && payload.email_verified)
      return NextResponse.redirect(new URL("/", request.url));
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

  const MEMBER_BLOCKED: (string | RegExp)[] = [
    "/admin",
    "/documents/new",
    "/documents/ingest",
    /^\/documents\/[^/]+\/edit/,
  ];
  function isMemberBlocked(p: string): boolean {
    return MEMBER_BLOCKED.some((rule) =>
      typeof rule === "string"
        ? p === rule || p.startsWith(rule + "/")
        : rule.test(p),
    );
  }
  if (payload.role === "member" && isMemberBlocked(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  if (newAccessToken) {
    response.cookies.set("access_token", newAccessToken, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: IS_PRODUCTION,
      maxAge: 60 * 60,
    });
    if (newRefreshToken) {
      response.cookies.set("refresh_token", newRefreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icons|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.webmanifest$).*)",
  ],
};
