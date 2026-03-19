import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) {
    return new Response(JSON.stringify({ url: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/storage/url?path=${encodeURIComponent(path)}`,
    req,
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
