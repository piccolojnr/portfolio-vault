import { RAG_BACKEND_URL } from "@/lib/config";
import { serverFetch } from "@/lib/server-fetch";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await serverFetch(
    `${RAG_BACKEND_URL}/api/v1/orgs/invites/${token}/accept`,
    req,
    { method: "POST" },
  );
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
