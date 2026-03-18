import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/system-prompt`,
    req,
  );
  return Response.json(await res.json().catch(() => ({})), { status: res.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/system-prompt`,
    req,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
  );
  return Response.json(await res.json().catch(() => ({})), { status: res.status });
}
