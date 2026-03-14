/**
 * app/api/chat/route.ts
 * ---------------------
 * POST /api/chat
 *
 * Request body:
 *   {
 *     message: string,
 *     history: { role: "user" | "assistant", content: string }[],
 *     conversation_id?: string   // if set, messages are persisted to DB
 *   }
 *
 * Flow:
 *   1. Classify the message intent with a fast/cheap model (Haiku / GPT-4o-mini)
 *   2. Route to the appropriate handler:
 *      - conversational  → respond naturally, skip RAG
 *      - retrieval       → retrieve vault chunks, answer directly
 *      - document        → retrieve vault chunks, generate formatted document
 *      - refinement      → refine prior document, retrieve only if needed
 *   3. Stream the LLM response back as SSE
 *   4. After streaming, persist messages to DB (if conversation_id provided)
 *   5. Emit a final { saved: { doc_type } } event so the frontend can update state
 */

import { validateConfig } from "@/lib/config";
import { classifyIntent } from "@/lib/intent";
import { orchestrate, type ChatMessage } from "@/lib/chat-pipeline";

validateConfig();

const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
} as const;

export async function POST(req: Request) {
    try {
        const { message, history, conversation_id } = (await req.json()) as {
            message: string;
            history: ChatMessage[];
            conversation_id?: string;
        };

        const classification = await classifyIntent(message, history);
        const readable = await orchestrate(classification, message, history, conversation_id);

        return new Response(readable, { headers: SSE_HEADERS });
    } catch (err) {
        console.error("[/api/chat] Error:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
