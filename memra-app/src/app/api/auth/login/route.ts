import { RAG_BACKEND_URL } from "@/lib/network";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Login failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ access_token });

  // Non-httponly cookie for middleware access
  response.cookies.set("access_token", access_token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    maxAge: 60 * 60, // 1 hour
  });

  // Re-issue refresh_token from Python with path=/api/auth so browser
  // sends it back to our /api/auth/refresh endpoint
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const refreshMatch = setCookie.match(/refresh_token=([^;]+)/);
    const maxAgeMatch = setCookie.match(/max-age=(\d+)/i);
    if (refreshMatch) {
      response.cookies.set("refresh_token", refreshMatch[1], {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
        maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1]) : 60 * 60 * 24 * 30,
      });
    }
  }

  return response;
}
