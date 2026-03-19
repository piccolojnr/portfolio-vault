import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  const body = await req.text();
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/${org_id}/transfer-ownership`,
    req,
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
  );
  return new Response(null, { status: res.status });
}
