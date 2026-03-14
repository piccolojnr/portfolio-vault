import { RAG_BACKEND_URL } from "@/lib/config";

export async function POST() {
  const res = await fetch(`${RAG_BACKEND_URL}/api/v1/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  // Pass the SSE stream through directly
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
