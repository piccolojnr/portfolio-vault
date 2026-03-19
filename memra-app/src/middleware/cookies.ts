import { NextResponse } from "next/server";
import { IS_PRODUCTION } from "@/lib/env";
import type { CookieConfig } from "./types";

export const ORG_COOKIES: CookieConfig = {
  accessName: "access_token",
  refreshName: "refresh_token",
  accessMaxAge: 60 * 60,
  refreshMaxAge: 60 * 60 * 24 * 30,
};

export const ADMIN_COOKIES: CookieConfig = {
  accessName: "admin_access_token",
  refreshName: "admin_refresh_token",
  accessMaxAge: 60 * 15,
  refreshMaxAge: 60 * 60 * 24 * 7,
};

export function attachTokenCookies(
  response: NextResponse,
  newAccess: string,
  newRefresh: string | null,
  config: CookieConfig,
): void {
  response.cookies.set(config.accessName, newAccess, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: IS_PRODUCTION,
    maxAge: config.accessMaxAge,
  });
  if (newRefresh) {
    response.cookies.set(config.refreshName, newRefresh, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: IS_PRODUCTION,
      maxAge: config.refreshMaxAge,
    });
  }
}
