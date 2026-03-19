import { RAG_BACKEND_URL } from "@/lib/network";
import { NextResponse } from "next/server";
import { setAuthCookies, extractRefreshToken } from "@/lib/cookies";

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
  const refresh = extractRefreshToken(res);
  const response = NextResponse.json({ access_token });
  setAuthCookies(response, access_token, refresh?.token, refresh?.maxAge);
  return response;
}
