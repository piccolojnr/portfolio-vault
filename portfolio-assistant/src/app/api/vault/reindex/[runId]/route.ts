import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/vault/reindex/${encodeURIComponent(runId)}`
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
