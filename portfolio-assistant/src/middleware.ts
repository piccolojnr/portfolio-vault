import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

// Always bypass — static assets and API routes
const BYPASS_PATHS = [
  "/api/",
  "/_next/",
  "/favicon",
  "/site.webmanifest",
  "/apple-touch-icon",
];

// Auth pages — accessible when logged out, redirect to / when logged in
const AUTH_PAGES = [
  "/login",
  "/register",
  "/auth/magic-link",
  "/auth/reset-password",
];

// Public pages — no auth check at all (e.g. invite acceptance handles its own flow)
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
  const secretStr = process.env.JWT_SECRET;

  if (!secretStr) {
    // JWT_SECRET not configured — decode without signature verification.
    // Set JWT_SECRET in .env.local (must match rag/.env) to enable full security.
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

  const secret = new TextEncoder().encode(secretStr);
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
  const backendUrl = process.env.RAG_BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${refreshToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;
    // Extract the rotated refresh token from set-cookie
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets, API routes, and explicitly public pages — always bypass
  if (isBypass(pathname) || isPublicPage(pathname)) return NextResponse.next();

  const accessCookie = request.cookies.get("access_token")?.value;
  const refreshCookie = request.cookies.get("refresh_token")?.value;

  let payload = accessCookie ? await verifyAccessToken(accessCookie) : null;
  let newAccessToken: string | null = null;
  let newRefreshToken: string | null = null;

  // Silent refresh — only when access token is absent/expired but refresh exists
  if (!payload && refreshCookie) {
    const tokens = await silentRefresh(refreshCookie);
    if (tokens) {
      payload = await verifyAccessToken(tokens.access_token);
      newAccessToken = tokens.access_token;
      newRefreshToken = tokens.refresh_token;
    }
  }

  // Auth pages (/login, /register, /auth/*): redirect authenticated users home
  // Only redirect if fully verified — unverified users may need to reach login to sign out
  if (isAuthPage(pathname)) {
    if (payload && payload.email_verified) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  // Protected route — no valid session → redirect to login
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Email verification gate
  if (!payload.email_verified && !pathname.startsWith("/auth/verify")) {
    return NextResponse.redirect(new URL("/auth/verify?pending=1", request.url));
  }

  // Onboarding gate
  if (!payload.onboarding_completed_at && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (payload.onboarding_completed_at && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Member role gate — members are read-only
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

  // Write fresh tokens from silent refresh into cookies
  if (newAccessToken) {
    const isProd = process.env.NODE_ENV === "production";
    response.cookies.set("access_token", newAccessToken, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: isProd,
      maxAge: 60 * 60,
    });
    if (newRefreshToken) {
      response.cookies.set("refresh_token", newRefreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
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
