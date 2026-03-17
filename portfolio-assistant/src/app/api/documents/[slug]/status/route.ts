import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}/status`,
    { cache: "no-store" }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
