import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/admin/ai-calls${qs ? `?${qs}` : ""}`,
    req,
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
