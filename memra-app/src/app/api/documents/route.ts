import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = `${RAG_BACKEND_URL}/api/v1/documents${qs ? `?${qs}` : ""}`;
  const res = await serverFetch(url, req);
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/documents`, req, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
