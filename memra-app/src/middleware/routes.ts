import { ADMIN_DOMAIN } from "@/lib/env";

/**
 * The prefixes to bypass
 */
const BYPASS_PREFIXES = [
  "/api/",
  "/_next/",
  "/favicon",
  "/site.webmanifest",
  "/apple-touch-icon",
];

/**
 * The auth pages
 */
const AUTH_PAGES = [
  "/login",
  "/register",
  "/auth/magic-link",
  "/auth/reset-password",
];

/**
 * The public pages
 */
const PUBLIC_PAGES = ["/auth/invite", "/auth/verify"];

/**
 * The admin public paths
 */
const ADMIN_PUBLIC_PATHS = ["/login", "/change-password"];

/**
 * The member blocked paths
 */
const MEMBER_BLOCKED: (string | RegExp)[] = [
  "/admin",
  "/documents/new",
  "/documents/ingest",
  /^\/documents\/[^/]+\/edit/,
];

export const DEV_ADMIN_MODE = !ADMIN_DOMAIN;

/**
 * Checks if the path is in the prefixes
 * @param pathname - The path to check
 * @param prefixes - The prefixes to check
 * @returns True if the path is in the prefixes
 */
function matchesPrefixes(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

/**
 * Checks if the path is in the exact or prefix paths
 * @param pathname - The path to check
 * @param paths - The paths to check
 * @returns True if the path is in the exact or prefix paths
 */
function matchesExactOrPrefix(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Checks if the host is the admin domain
 * @param host - The host to check
 * @returns True if the host is the admin domain
 */
export function isAdminDomain(host: string): boolean {
  if (!ADMIN_DOMAIN) return false;
  const bare = host.replace(/:\d+$/, "");
  return bare === ADMIN_DOMAIN || bare === ADMIN_DOMAIN.replace(/:\d+$/, "");
}
/**
 * Checks if the path is in the bypass prefixes
 * @param p - The path to check
 * @returns True if the path is in the bypass prefixes
 */
export const isBypass = (p: string) => matchesPrefixes(p, BYPASS_PREFIXES);
/**
 * Checks if the path is in the auth pages
 * @param p - The path to check
 * @returns True if the path is in the auth pages
 */
export const isAuthPage = (p: string) => matchesPrefixes(p, AUTH_PAGES);
/**
 * Checks if the path is in the public pages
 * @param p - The path to check
 * @returns True if the path is in the public pages
 */
export const isPublicPage = (p: string) => matchesPrefixes(p, PUBLIC_PAGES);

/**
 * Checks if the path is in the admin public paths
 * @param p - The path to check
 * @returns True if the path is in the admin public paths
 */
export const isAdminPublicPath = (p: string) =>
  matchesExactOrPrefix(p, ADMIN_PUBLIC_PATHS);

/**
 * Checks if the path is in the admin public dev paths
 * @param p - The path to check
 * @returns True if the path is in the admin public dev paths
 */
export const isAdminPublicDevPath = (p: string) =>
  matchesExactOrPrefix(
    p,
    ADMIN_PUBLIC_PATHS.map((x) => "/platform-admin" + x),
  );

/**
 * Checks if the path is blocked for members
 * @param pathname - The path to check
 * @returns True if the path is blocked for members
 */
export function isMemberBlocked(pathname: string): boolean {
  return MEMBER_BLOCKED.some((rule) =>
    typeof rule === "string"
      ? pathname === rule || pathname.startsWith(rule + "/")
      : rule.test(pathname),
  );
}
