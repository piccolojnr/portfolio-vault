import { RAG_BACKEND_URL } from "@/lib/network";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  // Best-effort: tell Python to invalidate the token
  if (refreshToken) {
    await fetch(`${RAG_BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
    }).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("access_token");
  response.cookies.set("refresh_token", "", {
    httpOnly: true,
    path: "/api/auth",
    maxAge: 0,
  });

  return response;
}
