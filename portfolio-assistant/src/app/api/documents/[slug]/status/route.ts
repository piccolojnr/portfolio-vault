import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}/status`,
    req,
    { cache: "no-store" } as RequestInit,
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
