import { proxyMutate } from "../../_helpers";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return proxyMutate(req, `/settings/${key}`, "PUT");
}
