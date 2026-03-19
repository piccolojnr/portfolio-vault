import { IS_PRODUCTION } from "@/lib/env";
import { RAG_BACKEND_URL } from "@/lib/network";
import { NextResponse } from "next/server";

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
  const response = NextResponse.json({ access_token });

  response.cookies.set("admin_access_token", access_token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: IS_PRODUCTION,
    maxAge: 60 * 15,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const refreshMatch = setCookie.match(/admin_refresh_token=([^;]+)/);
    if (refreshMatch) {
      response.cookies.set("admin_refresh_token", refreshMatch[1], {
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
