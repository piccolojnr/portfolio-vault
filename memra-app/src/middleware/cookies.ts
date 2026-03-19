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

const baseOptions = {
  sameSite: "lax" as const,
  path: "/",
  secure: IS_PRODUCTION,
};

export function attachTokenCookies(
  response: NextResponse,
  newAccess: string,
  newRefresh: string | null,
  config: CookieConfig,
): void {
  response.cookies.set(config.accessName, newAccess, {
    ...baseOptions,
    httpOnly: false,
    maxAge: config.accessMaxAge,
  });
  if (newRefresh) {
    response.cookies.set(config.refreshName, newRefresh, {
      ...baseOptions,
      httpOnly: true,
      maxAge: config.refreshMaxAge,
    });
  }
}
