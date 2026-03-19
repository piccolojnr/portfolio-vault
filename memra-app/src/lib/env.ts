/**
 * Centralized environment variables for the Next.js app.
 *
 * Import from "@/lib/env" instead of accessing process.env directly.
 * Server-only vars (no NEXT_PUBLIC_ prefix) are only available in
 * API routes, middleware, and server components.
 */

// ── Server-side ──────────────────────────────────────────────────────────────

export const RAG_BACKEND_URL =
  process.env.RAG_BACKEND_URL ?? "http://localhost:8000";

export const JWT_SECRET = process.env.JWT_SECRET ?? "";

export const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || JWT_SECRET;

export const ADMIN_DOMAIN = process.env.ADMIN_DOMAIN ?? "";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ── Client-side (NEXT_PUBLIC_*) ──────────────────────────────────────────────

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Memra";