import { proxyGet, proxyMutate } from "../_helpers";

export async function GET(req: Request) {
  return proxyGet(req, "/models");
}

export async function POST(req: Request) {
  return proxyMutate(req, "/models");
}
