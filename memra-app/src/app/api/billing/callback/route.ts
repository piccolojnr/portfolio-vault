import { RAG_BACKEND_URL } from "@/lib/network";

async function handle(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference");

  const res = await fetch(
    `${RAG_BACKEND_URL}/api/v1/billing/callback${
      reference ? `?reference=${encodeURIComponent(reference)}` : ""
    }`,
    {
      method: req.method,
    },
  );

  const location = res.headers.get("location");
  if (location) {
    return new Response(null, { status: res.status, headers: { location } });
  }

  const text = await res.text().catch(() => "");
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

