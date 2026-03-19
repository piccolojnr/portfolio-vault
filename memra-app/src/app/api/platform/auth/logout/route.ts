import { RAG_BACKEND_URL } from "@/lib/network";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_refresh_token=([^;]+)/);
  const refreshToken = match ? decodeURIComponent(match[1]) : null;

  if (refreshToken) {
    await fetch(`${RAG_BACKEND_URL}/api/v1/platform/auth/logout`, {
      method: "POST",
      headers: { Cookie: `admin_refresh_token=${refreshToken}` },
    }).catch(() => {});
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete("admin_access_token");
  response.cookies.delete("admin_refresh_token");
  return response;
}
