import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = `${RAG_BACKEND_URL}/api/v1/admin/jobs${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
