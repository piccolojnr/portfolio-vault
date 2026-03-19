import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/conversations/${id}/summary`,
    req,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return new Response(null, { status: res.status });
}
