import { RAG_BACKEND_URL } from "@/lib/network";
import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/cookies";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  if (refreshToken) {
    await fetch(`${RAG_BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${refreshToken}` },
    }).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
