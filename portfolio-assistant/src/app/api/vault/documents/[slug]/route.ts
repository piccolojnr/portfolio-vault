import { RAG_BACKEND_URL } from "@/lib/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/vault/documents/${encodeURIComponent(slug)}`
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
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/vault/documents/${encodeURIComponent(slug)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/vault/documents/${encodeURIComponent(slug)}`,
    { method: "DELETE" }
  );
  return new Response(null, { status: res.status });
}
