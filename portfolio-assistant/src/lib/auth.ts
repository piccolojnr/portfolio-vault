/**
 * lib/auth.ts
 * ===========
 * Client-side token management.
 *
 * Auth flow:
 *  - Middleware validates the access_token cookie (JWT verify) on every
 *    page navigation and silently refreshes it when expired.
 *  - AuthProvider reads the fresh cookie on mount and calls setAccessToken()
 *    to hydrate the in-memory token — no network call needed.
 *  - apiFetch uses the in-memory token for API calls and calls
 *    refreshAccessToken() as a fallback if the backend returns 401 mid-session.
 */

let _token: string | null = null;

// Shared in-flight refresh promise — prevents concurrent token rotations
// (e.g. React Strict Mode double-mount or parallel API calls all getting 401).
let _refreshPromise: Promise<string | null> | null = null;

export const getAccessToken = (): string | null => _token;

export const setAccessToken = (t: string): void => {
  _token = t;
};

export const clearTokens = async (): Promise<void> => {
  _token = null;
  _refreshPromise = null;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // best-effort
  }
};

export const refreshAccessToken = async (): Promise<string | null> => {
  // Deduplicate: return the in-flight promise if one is already running.
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) return null;
      const { access_token } = await res.json();
      setAccessToken(access_token);
      return access_token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
};
