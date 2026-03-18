import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/auth/me`, req);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(data, { status: res.status });
  }

  // Echo the access_token cookie back in the response body so the client
  // can hydrate its in-memory token without an extra /refresh round-trip.
  const tokenFromCookie = req.cookies.get("access_token")?.value ?? null;
  return Response.json({ ...data, access_token: tokenFromCookie }, { status: res.status });
}
