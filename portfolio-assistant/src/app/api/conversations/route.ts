import { RAG_BACKEND_URL } from "@/lib/config";

const BASE = `${RAG_BACKEND_URL}/api/v1/conversations`;

export async function GET() {
  const res = await fetch(BASE);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST() {
  const res = await fetch(BASE, { method: "POST" });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
