import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ org_id: string; invite_id: string }> },
) {
  const { org_id, invite_id } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/invites/${invite_id}`,
    req,
    { method: "DELETE" },
  );
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
