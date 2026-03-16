import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ corpus_id: string }> },
) {
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/graph/${(await params).corpus_id}`,
  );
  if (!res.ok) return new Response(null, { status: res.status });
  return new Response(res.body, {
    headers: { "Content-Type": "application/json" },
  });
}
