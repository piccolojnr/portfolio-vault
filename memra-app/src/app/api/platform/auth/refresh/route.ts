import { RAG_BACKEND_URL } from "@/lib/network";
import { NextResponse } from "next/server";
import { setAdminAuthCookies, extractRefreshToken } from "@/lib/cookies";

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_refresh_token=([^;]+)/);
  const refreshToken = match ? decodeURIComponent(match[1]) : null;

  if (!refreshToken) {
    return NextResponse.json({ detail: "No refresh token" }, { status: 401 });
  }

  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/platform/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `admin_refresh_token=${refreshToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Refresh failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;
  const refresh = extractRefreshToken(res, "admin_refresh_token");
  const response = NextResponse.json({ access_token });
  setAdminAuthCookies(response, access_token, refresh?.token, refresh?.maxAge);
  return response;
}
