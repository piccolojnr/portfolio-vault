import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}`,
    req,
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}`,
    req,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/documents/${encodeURIComponent(slug)}`,
    req,
    { method: "DELETE" }
  );
  return new Response(null, { status: res.status });
}
