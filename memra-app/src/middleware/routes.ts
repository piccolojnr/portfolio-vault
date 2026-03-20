import { ADMIN_DOMAIN, APP_DOMAIN } from "@/lib/env";

const BYPASS_PREFIXES = [
  "/api/",
  "/_next/",
  "/favicon",
  "/site.webmanifest",
  "/apple-touch-icon",
];

const AUTH_PAGES = [
  "/login",
  "/register",
  "/auth/magic-link",
  "/auth/reset-password",
];

const PUBLIC_PAGES = ["/auth/invite", "/auth/verify"];
const MAIN_MARKETING_PAGES = [
  "/",
  "/pricing",
  "/features",
  "/security",
  "/integrations",
  "/docs",
  "/blog",
  "/contact",
  "/about",
  "/legal",
];

const ADMIN_PUBLIC_PATHS = ["/login", "/change-password"];

const MEMBER_BLOCKED: (string | RegExp)[] = [
  "/app/admin",
  "/app/documents/new",
  "/app/documents/ingest",
  /^\/app\/documents\/[^/]+\/edit/,
];

export const DEV_ADMIN_MODE = !ADMIN_DOMAIN;

function matchesPrefixes(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

function matchesExactOrPrefix(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function isAdminDomain(host: string): boolean {
  if (!ADMIN_DOMAIN) return false;
  const bare = host.replace(/:\d+$/, "");
  return bare === ADMIN_DOMAIN || bare === ADMIN_DOMAIN.replace(/:\d+$/, "");
}

export function isAppDomain(host: string): boolean {
  if (!APP_DOMAIN) return false;
  const bare = host.replace(/:\d+$/, "");
  return bare === APP_DOMAIN || bare === APP_DOMAIN.replace(/:\d+$/, "");
}
export const isBypass = (p: string) => matchesPrefixes(p, BYPASS_PREFIXES);
export const isAuthPage = (p: string) => matchesPrefixes(p, AUTH_PAGES);
export const isPublicPage = (p: string) => matchesPrefixes(p, PUBLIC_PAGES);
export const isMainDomainPublic = (p: string) =>
  matchesExactOrPrefix(p, MAIN_MARKETING_PAGES) || isPublicPage(p);

export const isAdminPublicPath = (p: string) =>
  matchesExactOrPrefix(p, ADMIN_PUBLIC_PATHS);

export const isAdminPublicDevPath = (p: string) =>
  matchesExactOrPrefix(
    p,
    ADMIN_PUBLIC_PATHS.map((x) => "/platform-admin" + x),
  );

export function isMemberBlocked(pathname: string): boolean {
  return MEMBER_BLOCKED.some((rule) =>
    typeof rule === "string"
      ? pathname === rule || pathname.startsWith(rule + "/")
      : rule.test(pathname),
  );
}
