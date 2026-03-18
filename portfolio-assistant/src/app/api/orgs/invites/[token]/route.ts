import { RAG_BACKEND_URL } from "@/lib/config";

// Public endpoint — no auth required
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/orgs/invites/${token}`);
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
