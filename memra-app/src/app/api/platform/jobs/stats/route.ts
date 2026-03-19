import { proxyGet } from "../../_helpers";

export async function GET(req: Request) {
  return proxyGet(req, "/jobs/stats");
}
