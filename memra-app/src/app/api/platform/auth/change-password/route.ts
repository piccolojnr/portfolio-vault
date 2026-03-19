import { proxyMutate } from "../../_helpers";

export async function POST(req: Request) {
  return proxyMutate(req, "/auth/change-password");
}
