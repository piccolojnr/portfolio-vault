import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST(req: Request) {
  // Forward FormData as-is — do NOT set Content-Type so the boundary is preserved
  const formData = await req.formData();
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/documents/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
