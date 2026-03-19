import { proxyMutate } from "../../../_helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ job_id: string }> },
) {
  const { job_id } = await params;
  return proxyMutate(req, `/jobs/${job_id}/retry`);
}
