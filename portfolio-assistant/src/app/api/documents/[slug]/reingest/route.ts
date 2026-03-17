import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}/reingest`,
    { method: "POST" }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
