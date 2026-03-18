/**
 * lib/server-fetch.ts
 * ===================
 * Server-side auth-aware fetch for Next.js API route handlers.
 * Reads the access token from the incoming request — preferring the
 * Authorization header (set by client-side apiFetch) over the access_token
 * cookie (set on login/refresh for middleware and initial page load).
 */

function getTokenFromRequest(request: Request): string | null {
  // Prefer Authorization header (forwarded from client-side apiFetch)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to access_token cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function serverFetch(
  url: string,
  request: Request,
  init?: RequestInit,
): Promise<Response> {
  const token = getTokenFromRequest(request);
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
