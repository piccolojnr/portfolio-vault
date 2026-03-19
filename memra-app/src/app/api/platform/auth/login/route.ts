import { IS_PRODUCTION, RAG_BACKEND_URL } from "@/lib/env";
import { NextResponse } from "next/server";

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
  const response = NextResponse.json({ access_token, must_change_password });

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
    const maxAgeMatch = setCookie.match(/max-age=(\d+)/i);
    if (refreshMatch) {
      response.cookies.set("admin_refresh_token", refreshMatch[1], {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
        maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1]) : 60 * 60 * 24 * 7,
      });
    }
  }

  return response;
}
