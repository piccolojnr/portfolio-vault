import { RAG_BACKEND_URL, serverFetch } from "@/lib/network";
import { NextRequest, NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/cookies";

export async function GET(req: NextRequest) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/auth/me`, req);
  const data = await res.json().catch(() => ({}));

  if (res.status === 404) {
    req.cookies.delete("access_token");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!res.ok) {
    return Response.json(data, { status: res.status });
  }

  const tokenFromCookie = req.cookies.get("access_token")?.value ?? null;
  return Response.json({ ...data, access_token: tokenFromCookie }, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/auth/me`, req, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(data, { status: res.status });
  }

  const newToken: string | undefined = data.access_token;
  const response = NextResponse.json(data, { status: res.status });
  if (newToken) {
    setAuthCookies(response, newToken);
  }
  return response;
}
