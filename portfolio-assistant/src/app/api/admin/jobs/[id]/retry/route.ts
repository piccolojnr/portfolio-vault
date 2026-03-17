import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/admin/jobs/${id}/retry`, {
    method: "POST",
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
