import { proxyMutate } from "../../../_helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params;
  return proxyMutate(req, `/orgs/${org_id}/plan`);
}
