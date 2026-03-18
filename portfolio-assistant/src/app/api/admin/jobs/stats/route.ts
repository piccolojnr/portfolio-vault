import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(req: Request) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/admin/jobs/stats`, req);
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
