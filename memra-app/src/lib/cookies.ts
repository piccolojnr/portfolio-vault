import { NextResponse } from "next/server";
import { IS_PRODUCTION } from "@/lib/env";

const baseOptions = {
  sameSite: "lax" as const,
  path: "/",
  secure: IS_PRODUCTION,
};

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string | null,
  refreshMaxAge?: number,
) {
  response.cookies.set("access_token", accessToken, {
    ...baseOptions,
    httpOnly: false,
    maxAge: 60 * 60,
  });
  if (refreshToken) {
    response.cookies.set("refresh_token", refreshToken, {
      ...baseOptions,
      httpOnly: true,
      maxAge: refreshMaxAge ?? 60 * 60 * 24 * 30,
    });
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set("access_token", "", {
    ...baseOptions,
    httpOnly: false,
    maxAge: 0,
  });
  response.cookies.set("refresh_token", "", {
    ...baseOptions,
    httpOnly: true,
    maxAge: 0,
  });
}

export function setAdminAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string | null,
  refreshMaxAge?: number,
) {
  response.cookies.set("admin_access_token", accessToken, {
    ...baseOptions,
    httpOnly: false,
    maxAge: 60 * 15,
  });
  if (refreshToken) {
    response.cookies.set("admin_refresh_token", refreshToken, {
      ...baseOptions,
      httpOnly: true,
      maxAge: refreshMaxAge ?? 60 * 60 * 24 * 7,
    });
  }
}

export function extractRefreshToken(
  res: Response,
  cookieName = "refresh_token",
): { token: string; maxAge: number } | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const refreshMatch = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  if (!refreshMatch) return null;
  const maxAgeMatch = setCookie.match(/max-age=(\d+)/i);
  return {
    token: refreshMatch[1],
    maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1]) : 60 * 60 * 24 * 30,
  };
}
