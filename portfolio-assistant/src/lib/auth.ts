/**
 * lib/auth.ts
 * ===========
 * Client-side token management.
 * The access token lives in a module-level variable (in-memory) so it is
 * never directly readable from the DOM. The non-httponly `access_token`
 * cookie is only used by Next.js middleware and server-side API routes.
 */

let _token: string | null = null;

export const getAccessToken = (): string | null => _token;

export const setAccessToken = (t: string): void => {
  _token = t;
};

export const clearTokens = async (): Promise<void> => {
  _token = null;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // best-effort
  }
};

export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (!res.ok) return null;
    const { access_token } = await res.json();
    setAccessToken(access_token);
    return access_token;
  } catch {
    return null;
  }
};
