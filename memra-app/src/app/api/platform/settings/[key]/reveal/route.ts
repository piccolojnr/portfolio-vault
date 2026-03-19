import { proxyGet } from "../../../_helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return proxyGet(req, `/settings/${key}/reveal`);
}
