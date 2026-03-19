import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/corpora`,
    req,
  );
  const data = await res.json().catch(() => ([]));
  return Response.json(data, { status: res.status });
}
