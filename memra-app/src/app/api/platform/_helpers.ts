/**
 * Shared helpers for platform admin API proxy routes.
 */

import { RAG_BACKEND_URL } from "@/lib/network";

/** Extract admin token from the incoming request. */
export function getAdminToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Proxy a GET request with query params to the platform backend. */
export async function proxyGet(
  req: Request,
  backendPath: string,
): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = `${RAG_BACKEND_URL}/api/v1/platform${backendPath}${qs ? `?${qs}` : ""}`;
  const token = getAdminToken(req);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Proxy a POST/PUT request with JSON body to the platform backend. */
export async function proxyMutate(
  req: Request,
  backendPath: string,
  method: "POST" | "PUT" = "POST",
): Promise<Response> {
  const url = `${RAG_BACKEND_URL}/api/v1/platform${backendPath}`;
  const token = getAdminToken(req);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = await req.text();
  const res = await fetch(url, { method, headers, body: body || undefined });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
