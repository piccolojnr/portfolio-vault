import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";
import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/cookies";

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
  const response = NextResponse.json({ access_token });
  setAuthCookies(response, access_token);
  return response;
}
