import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(req: Request) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/graph`, req);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Graph unavailable" }));
    return Response.json(data, { status: res.status });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "application/json" },
  });
}
