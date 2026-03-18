import { RAG_BACKEND_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Registration failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ access_token }, { status: 201 });

  response.cookies.set("access_token", access_token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    maxAge: 60 * 60,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const refreshMatch = setCookie.match(/refresh_token=([^;]+)/);
    const maxAgeMatch = setCookie.match(/max-age=(\d+)/i);
    if (refreshMatch) {
      response.cookies.set("refresh_token", refreshMatch[1], {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
        maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1]) : 60 * 60 * 24 * 30,
      });
    }
  }

  return response;
}
