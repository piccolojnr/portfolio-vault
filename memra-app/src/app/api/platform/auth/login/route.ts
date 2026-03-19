import { RAG_BACKEND_URL } from "@/lib/env";
import { NextResponse } from "next/server";
import { setAdminAuthCookies, extractRefreshToken } from "@/lib/cookies";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/platform/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Login failed" }));
    return NextResponse.json(data, {
      status: res.status,
      headers: res.headers.get("retry-after")
        ? { "Retry-After": res.headers.get("retry-after")! }
        : undefined,
    });
  }

  const data = await res.json();
  const { access_token, must_change_password } = data;
  const refresh = extractRefreshToken(res, "admin_refresh_token");
  const response = NextResponse.json({ access_token, must_change_password });
  setAdminAuthCookies(response, access_token, refresh?.token, refresh?.maxAge);
  return response;
}
