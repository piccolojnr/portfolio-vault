/**
 * lib/api.ts
 * ==========
 * Client-side auth-aware fetch utility.
 * Adds Authorization header, retries once after token refresh on 401,
 * and redirects to /login if refresh also fails.
 */

import { getAccessToken, refreshAccessToken } from "@/lib/auth";

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
    // If this is a paywall response, dispatch it so the global modal can open.
    if (typeof window !== "undefined" && (res.status === 402 || res.status === 403)) {
      try {
        const parsed = JSON.parse(text) as Partial<{ code: string; limit: number; used: number; plan: string; upgrade_url: string; error: string }>;
        if (parsed && parsed.code && parsed.upgrade_url) {
          window.dispatchEvent(
            new CustomEvent("paywall:show", {
              detail: parsed,
            }),
          );
        }
      } catch {
        // ignore parsing failures — existing codepath will still throw
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
