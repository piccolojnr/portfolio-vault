import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/export/docx`, req, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return new Response(text, { status: res.status });
  }
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ?? 'attachment; filename="document.docx"',
    },
  });
}
