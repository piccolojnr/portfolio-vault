import { proxyGet } from "../../_helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  return proxyGet(req, `/orgs/${org_id}`);
}
