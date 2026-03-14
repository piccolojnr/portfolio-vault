import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST() {
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/vault/reindex`, {
    method: "POST",
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
