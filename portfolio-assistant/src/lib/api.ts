/**
 * lib/api.ts
 * ==========
 * Client-side auth-aware fetch utility.
 * Adds Authorization header, retries once after token refresh on 401,
 * and redirects to /login if refresh also fails.
 */

import { getAccessToken, refreshAccessToken } from "./auth";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const makeRequest = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let res = await makeRequest(getAccessToken());

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      if (typeof window !== "undefined") {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new Error("Session expired");
    }
    res = await makeRequest(newToken);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
