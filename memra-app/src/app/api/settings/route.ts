import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function GET(req: Request) {
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/settings`, req);
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PUT(req: Request) {
  const body = await req.text();
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/settings`, req, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
