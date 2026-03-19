import { proxyGet } from "../../_helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params;
  return proxyGet(req, `/users/${user_id}`);
}
