import { RAG_BACKEND_URL } from "@/lib/network";

async function handle(req: Request) {
  const url = new URL(req.url);
  const reference =
    url.searchParams.get("reference") ?? url.searchParams.get("trxref");

  // Trigger backend verification side-effects, but keep final redirect on the
  // current app origin so auth cookies/domain stay consistent.
  await fetch(
    `${RAG_BACKEND_URL}/api/v1/billing/callback${
      reference ? `?reference=${encodeURIComponent(reference)}` : ""
    }`,
    {
      method: req.method,
      redirect: "manual",
    },
  );

  const redirectUrl = new URL("/settings/billing", url.origin);
  redirectUrl.searchParams.set("payment", "success");
  if (reference) redirectUrl.searchParams.set("reference", reference);
  return Response.redirect(redirectUrl, 307);
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

