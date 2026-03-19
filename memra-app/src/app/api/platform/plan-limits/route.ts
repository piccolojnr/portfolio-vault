import { proxyGet, proxyMutate } from "../_helpers";

export async function GET(req: Request) {
  return proxyGet(req, "/plan-limits");
}

export async function PUT(req: Request) {
  return proxyMutate(req, "/plan-limits", "PUT");
}

