/**
 * Platform admin token management.
 * Completely separate from org user auth.
 */

let _adminToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export const getAdminAccessToken = (): string | null => _adminToken;

export const setAdminAccessToken = (t: string): void => {
  _adminToken = t;
};

export const clearAdminTokens = async (): Promise<void> => {
  _adminToken = null;
  _refreshPromise = null;
  try {
    await fetch("/api/platform/auth/logout", { method: "POST" });
  } catch {
    // best-effort
  }
};

export const refreshAdminAccessToken = async (): Promise<string | null> => {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch("/api/platform/auth/refresh", { method: "POST" });
      if (!res.ok) return null;
      const { access_token } = await res.json();
      setAdminAccessToken(access_token);
      return access_token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
};
