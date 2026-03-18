import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

const base = (id: string) =>
  `${RAG_BACKEND_URL}/api/v1/conversations/${id}`;

async function proxyJson(res: Response): Promise<Response> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return Response.json(data, { status: res.status });
  } catch {
    return new Response(text, { status: res.status });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await serverFetch(base(id), req);
  return proxyJson(res);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const res = await serverFetch(base(id), req, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return proxyJson(res);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await serverFetch(base(id), req, { method: "DELETE" });
  return new Response(null, { status: res.status });
}
