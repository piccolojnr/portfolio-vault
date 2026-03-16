import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit";

// NOTE: In-memory — counters reset on Vercel cold starts.
// Intentional: goal is abuse prevention, not strict enforcement.

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

const TIERS: Array<[string, RateLimitConfig]> = [
  ["/api/chat",         { limit: 10, windowMs: 60_000 }],
  ["/api/pipeline/run", { limit: 3,  windowMs: 5 * 60_000 }],
  ["/api/export/",      { limit: 10, windowMs: 60_000 }],
  ["/api/",             { limit: 60, windowMs: 60_000 }],
];

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const ip = getIp(req);

  const [tierPrefix, tierConfig] = TIERS.find(([prefix]) => pathname.startsWith(prefix)) ?? TIERS[TIERS.length - 1];

  const key = `${ip}:${tierPrefix}`;
  const result = checkRateLimit(key, tierConfig);

  const resetEpochSec = Math.floor((Date.now() + result.resetAfterMs) / 1000);

  if (!result.allowed) {
    const retryAfter = Math.ceil(result.resetAfterMs / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetEpochSec),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(resetEpochSec));
  return response;
}

export const config = { matcher: "/api/:path*" };
