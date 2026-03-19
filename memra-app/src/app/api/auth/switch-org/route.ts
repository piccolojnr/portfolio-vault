import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/auth/switch-org`,
    req,
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Switch failed" }));
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

  return response;
}
