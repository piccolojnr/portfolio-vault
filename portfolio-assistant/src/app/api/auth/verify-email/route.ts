import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
