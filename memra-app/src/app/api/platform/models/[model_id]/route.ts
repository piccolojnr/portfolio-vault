import { proxyMutate } from "../../_helpers";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ model_id: string }> },
) {
  const { model_id } = await params;
  return proxyMutate(req, `/models/${model_id}`, "PUT");
}
