import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";
import { NextResponse } from "next/server";
import { setAuthCookies, extractRefreshToken } from "@/lib/cookies";

export async function PATCH(req: Request) {
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/auth/onboarding`,
    req,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Onboarding failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;
  const refresh = extractRefreshToken(res);
  const response = NextResponse.json({ access_token });
  setAuthCookies(response, access_token, refresh?.token, refresh?.maxAge);
  return response;
}
