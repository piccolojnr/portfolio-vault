import { RAG_BACKEND_URL } from "@/lib/network";

export async function POST(req: Request) {
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const contentType = req.headers.get("content-type") ?? "application/json";

  // Forward the raw request body bytes so the backend can validate the
  // Paystack HMAC signature against the original payload.
  const rawBody = await req.arrayBuffer();

  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/webhooks/paystack`, {
    method: "POST",
    headers: {
      "x-paystack-signature": signature,
      "content-type": contentType,
    },
    body: rawBody,
  });

  const text = await res.text().catch(() => "");
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

