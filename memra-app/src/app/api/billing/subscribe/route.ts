import { RAG_BACKEND_URL, serverFetch } from "@/lib/network";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/billing/subscribe`,
    req,
    { method: "POST", headers: { "content-type": "application/json" }, body },
  );
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}

