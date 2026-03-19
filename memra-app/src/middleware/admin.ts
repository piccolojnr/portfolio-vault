import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccessToken, silentAdminRefresh } from "./token";
import { attachTokenCookies, ADMIN_COOKIES } from "./cookies";
import type { AdminTokenPayload } from "./types";

interface AdminAuthResult {
  payload: AdminTokenPayload | null;
  newAccess: string | null;
  newRefresh: string | null;
}

async function authenticateAdmin(
  request: NextRequest,
): Promise<AdminAuthResult> {
  const adminAccess = request.cookies.get("admin_access_token")?.value;
  const adminRefresh = request.cookies.get("admin_refresh_token")?.value;

  let payload = adminAccess
    ? await verifyAdminAccessToken(adminAccess)
    : null;
  let newAccess: string | null = null;
  let newRefresh: string | null = null;

  if (!payload && adminRefresh) {
    const tokens = await silentAdminRefresh(adminRefresh);
    if (tokens) {
      payload = await verifyAdminAccessToken(tokens.access_token);
      newAccess = tokens.access_token;
      newRefresh = tokens.refresh_token;
    }
  }

  return { payload, newAccess, newRefresh };
}

function applyAdminTokens(
  response: NextResponse,
  auth: AdminAuthResult,
): void {
  if (auth.newAccess) {
    attachTokenCookies(response, auth.newAccess, auth.newRefresh, ADMIN_COOKIES);
  }
}

export async function handleAdminDomain(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  const internalPath = `/platform-admin${pathname === "/" ? "" : pathname}`;
  const rewriteUrl = new URL(internalPath, request.url);

  const auth = await authenticateAdmin(request);

  if (!auth.payload) {
    return NextResponse.rewrite(new URL("/platform-admin/login", request.url));
  }

  const response = NextResponse.rewrite(rewriteUrl);
  applyAdminTokens(response, auth);
  return response;
}

export async function handleAdminDevMode(
  request: NextRequest,
): Promise<NextResponse> {
  const auth = await authenticateAdmin(request);

  if (!auth.payload) {
    return NextResponse.redirect(
      new URL("/platform-admin/login", request.url),
    );
  }

  const response = NextResponse.next();
  applyAdminTokens(response, auth);
  return response;
}
