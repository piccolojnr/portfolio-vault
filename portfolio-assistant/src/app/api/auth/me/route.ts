import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";
import { NextRequest, NextResponse } from "next/server";

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

  // Echo the access_token cookie back in the response body so the client
  // can hydrate its in-memory token without an extra /refresh round-trip.
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

  // Set the fresh access_token as a cookie so middleware stays in sync
  const newToken: string | undefined = data.access_token;
  const response = NextResponse.json(data, { status: res.status });
  if (newToken) {
    response.cookies.set("access_token", newToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15, // 15 minutes (matches JWT expiry)
    });
  }
  return response;
}
