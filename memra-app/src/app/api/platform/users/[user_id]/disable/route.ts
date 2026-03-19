import { proxyMutate } from "../../../_helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params;
  return proxyMutate(req, `/users/${user_id}/disable`);
}
