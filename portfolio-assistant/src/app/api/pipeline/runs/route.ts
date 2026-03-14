import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const params = searchParams.toString();
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/pipeline/runs${params ? `?${params}` : ""}`,
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
