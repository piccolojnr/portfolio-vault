import { RAG_BACKEND_URL } from "@/lib/network";
import { NextRequest, NextResponse } from "next/server";
import { setAuthCookies, extractRefreshToken } from "@/lib/cookies";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ detail: "No refresh token" }, { status: 401 });
  }

  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `refresh_token=${refreshToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Refresh failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;
  const refresh = extractRefreshToken(res);
  const response = NextResponse.json({ access_token });
  setAuthCookies(response, access_token, refresh?.token, refresh?.maxAge);
  return response;
}
