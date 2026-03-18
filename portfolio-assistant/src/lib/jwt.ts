/**
 * lib/jwt.ts
 * ==========
 * Client-side JWT helpers. Does NOT verify signatures — only decodes the
 * payload. Signature verification happens in middleware via `jose`.
 */

export interface JwtPayload {
  sub: string;
  org_id: string;
  org_name: string;
  role: string;
  email: string;
  onboarding_completed_at: string | null;
  type: string;
  iat: number;
  exp: number;
}

/** Base64url-decode the JWT payload without verifying the signature. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: JwtPayload): boolean {
  return Date.now() / 1000 >= payload.exp;
}
