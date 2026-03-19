import { RAG_BACKEND_URL } from "@/lib/network";
import { serverFetch } from "@/lib/network";

const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
} as const;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const res = await serverFetch(`${RAG_BACKEND_URL}/api/v1/chat/stream`, req, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            return new Response(JSON.stringify({ error: text }), {
                status: res.status,
                headers: { "Content-Type": "application/json" },
            });
        }
        return new Response(res.body, { headers: SSE_HEADERS });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
