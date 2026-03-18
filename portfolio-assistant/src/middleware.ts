import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/auth/",
  "/api/",
  "/_next/",
  "/favicon",
  "/site.webmanifest",
  "/apple-touch-icon",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Allow through if either the access token or refresh token is present.
  // The access_token expires in 1h but the refresh_token lasts 30d — if only
  // the refresh_token is present the AuthProvider will silently re-issue the
  // access_token on mount before any protected content renders.
  const accessToken = request.cookies.get("access_token");
  const refreshToken = request.cookies.get("refresh_token");
  console.log("Middleware check:", { pathname, accessToken: !!accessToken, refreshToken: !!refreshToken });
  if (!accessToken?.value && !refreshToken?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files.
     * The isPublic() check inside middleware handles the rest.
     */
    "/((?!_next/static|_next/image|favicon|icons|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.webmanifest$).*)",
  ],
};
