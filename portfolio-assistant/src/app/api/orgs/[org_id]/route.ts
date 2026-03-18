import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}`,
    req,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
  );
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
