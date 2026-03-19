import { RAG_BACKEND_URL, serverFetch } from "@/lib/network";

export async function POST(req: Request) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/billing/cancel`, req, {
    method: "POST",
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}

