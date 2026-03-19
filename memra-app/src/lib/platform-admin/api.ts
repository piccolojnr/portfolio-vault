/**
 * Client-side fetch for platform admin API.
 * Mirrors apiFetch but uses admin token management.
 */

import {
  getAdminAccessToken,
  refreshAdminAccessToken,
} from "./auth";

export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const makeRequest = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let res = await makeRequest(getAdminAccessToken());

  if (res.status === 401) {
    const newToken = await refreshAdminAccessToken();
    if (!newToken) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Admin session expired");
    }
    res = await makeRequest(newToken);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
