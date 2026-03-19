import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ org_id: string; user_id: string }> },
) {
  const { org_id, user_id } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/members/${user_id}`,
    req,
    { method: "DELETE" },
  );
  return new Response(null, { status: res.status });
}
