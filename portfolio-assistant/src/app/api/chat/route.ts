/**
 * app/api/chat/route.ts
 * ---------------------
 * Thin SSE proxy — all chat logic has moved to the Python backend.
 *
 * POST /api/chat → POST http://python-backend/api/v1/chat/stream
 *
 * The Python backend handles:
 *   1. Fetch authoritative history from DB + trim to token budget
 *   2. Summary injection
 *   3. Intent classification
 *   4. RAG retrieval (Qdrant or LightRAG)
 *   5. LLM streaming
 *   6. Message persistence + background summarisation
 */

import { RAG_BACKEND_URL } from "@/lib/config";

const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
} as const;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const res = await fetch(`${RAG_BACKEND_URL}/api/v1/chat/stream`, {
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
