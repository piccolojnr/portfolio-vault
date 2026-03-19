import { RAG_BACKEND_URL, serverFetch } from "@/lib/network";

export async function GET(req: Request) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/billing/history`, req);
  const data = await res.json().catch(() => ([]));
  return Response.json(data, { status: res.status });
}

