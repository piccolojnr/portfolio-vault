import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/auth/onboarding`,
    req,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Onboarding failed" }));
    return NextResponse.json(data, { status: res.status });
  }

  const data = await res.json();
  const { access_token } = data;

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ access_token });

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
