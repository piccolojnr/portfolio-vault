import { proxyGet } from "../../_helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ audit_id: string }> },
) {
  const { audit_id } = await params;
  return proxyGet(req, `/audit-logs/${audit_id}`);
}
