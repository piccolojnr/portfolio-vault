import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

const BASE = `${RAG_BACKEND_URL}/api/v1/conversations`;

export async function GET(req: Request) {
  const res = await serverFetch(BASE, req);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const res = await serverFetch(BASE, req, { method: "POST" });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
