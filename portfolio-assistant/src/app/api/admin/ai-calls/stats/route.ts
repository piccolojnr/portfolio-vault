import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET() {
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/admin/ai-calls/stats`);
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
