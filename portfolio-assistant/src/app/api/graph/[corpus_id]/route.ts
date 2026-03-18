import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ corpus_id: string }> },
) {
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/graph/${(await params).corpus_id}`,
    req,
  );
  if (!res.ok) return new Response(null, { status: res.status });
  return new Response(res.body, {
    headers: { "Content-Type": "application/json" },
  });
}
