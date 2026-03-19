import { jwtVerify, type JWTPayload } from "jose";
import { JWT_SECRET, ADMIN_JWT_SECRET, RAG_BACKEND_URL } from "@/lib/env";
import type {
  TokenPayload,
  AdminTokenPayload,
  RefreshResult,
} from "./types";

function decodeUnsafe<T extends JWTPayload>(
  token: string,
  expectedType: string,
): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const p = JSON.parse(atob(padded)) as T & {
      sub?: string;
      type?: string;
      exp?: number;
    };
    if (!p.sub || p.type !== expectedType) return null;
    if (p.exp && Date.now() / 1000 >= p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

async function verifyJwt<T extends JWTPayload>(
  token: string,
  secret: string,
  expectedType: string,
): Promise<T | null> {
  if (!secret) return decodeUnsafe<T>(token, expectedType);

  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    if ((payload as T & { type?: string }).type !== expectedType) return null;
    return payload as T;
  } catch {
    return null;
  }
}

async function refreshTokens(
  endpoint: string,
  cookieName: string,
  refreshToken: string,
): Promise<RefreshResult | null> {
  try {
    const res = await fetch(`${RAG_BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { Cookie: `${cookieName}=${refreshToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
    return {
      access_token: data.access_token,
      refresh_token: match ? match[1] : refreshToken,
    };
  } catch {
    return null;
  }
}

export function verifyAccessToken(
  token: string,
): Promise<TokenPayload | null> {
  return verifyJwt<TokenPayload>(token, JWT_SECRET, "access");
}

export function verifyAdminAccessToken(
  token: string,
): Promise<AdminTokenPayload | null> {
  return verifyJwt<AdminTokenPayload>(token, ADMIN_JWT_SECRET, "platform_admin");
}

export function silentRefresh(
  refreshToken: string,
): Promise<RefreshResult | null> {
  return refreshTokens(
    "/api/v1/auth/refresh",
    "refresh_token",
    refreshToken,
  );
}

export function silentAdminRefresh(
  refreshToken: string,
): Promise<RefreshResult | null> {
  return refreshTokens(
    "/api/v1/platform/auth/refresh",
    "admin_refresh_token",
    refreshToken,
  );
}
