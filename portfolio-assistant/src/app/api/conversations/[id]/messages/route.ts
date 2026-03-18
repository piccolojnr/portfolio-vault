import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/conversations/${id}/messages${qs ? `?${qs}` : ""}`,
    req,
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/conversations/${id}/messages`,
    req,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
