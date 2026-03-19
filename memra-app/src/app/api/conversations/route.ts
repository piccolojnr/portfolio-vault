import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

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
