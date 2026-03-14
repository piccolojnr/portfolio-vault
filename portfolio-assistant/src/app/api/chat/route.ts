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
 * Flow (when conversation_id is provided):
 *   1. Fetch the authoritative history from DB — has message IDs + summary
 *   2. Trim history to token budget (3000 tokens, walking backwards)
 *   3. If trim occurred and a summary exists, inject it as a synthetic
 *      user/assistant pair before the kept messages
 *   4. Classify the message intent (Haiku / GPT-4o-mini)
 *   5. Route to the appropriate handler, stream the response
 *   6. After streaming: fire-and-forget background summarisation if needed
 *
 * Flow (new conversation, no conversation_id):
 *   Steps 1–3 are skipped; history from the request body is used directly.
 */

import { validateConfig, RAG_BACKEND_URL } from "@/lib/config";
import { classifyIntent } from "@/lib/intent";
import { orchestrate, type ChatMessage } from "@/lib/chat-pipeline";
import { trimToTokenBudget } from "@/lib/token-budget";
import { maybeTriggerSummarization } from "@/lib/summarizer";
import type { ConversationDetail } from "@/lib/conversations";

validateConfig();

const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
} as const;

// ── Server-side fetch helpers ─────────────────────────────────────────────────

/**
 * Fetches the full conversation from the Python backend directly.
 * Must use RAG_BACKEND_URL (absolute) — relative URLs don't work server-side.
 */
async function fetchConversation(convId: string): Promise<ConversationDetail | null> {
    try {
        const res = await fetch(`${RAG_BACKEND_URL}/api/v1/conversations/${convId}`);
        if (!res.ok) return null;
        return res.json() as Promise<ConversationDetail>;
    } catch {
        return null;
    }
}

// ── Summary injection helpers ─────────────────────────────────────────────────

/**
 * Prepends a synthetic user/assistant exchange that carries the rolling
 * summary, maintaining strict alternating-role order required by both APIs.
 */
function injectSummary(summary: string, history: ChatMessage[]): ChatMessage[] {
    return [
        { role: "user", content: `[Earlier context: ${summary}]` },
        { role: "assistant", content: "Understood, I have context from our earlier conversation." },
        ...history,
    ];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const { message, history: clientHistory, conversation_id } = (await req.json()) as {
            message: string;
            history: ChatMessage[];
            conversation_id?: string;
        };

        let history = clientHistory;
        let summaryTriggerData: Parameters<typeof maybeTriggerSummarization>[0] | null = null;

        // ── Step 1–3: Fetch, trim, inject (only when conversation exists in DB) ──
        if (conversation_id) {
            const conv = await fetchConversation(conversation_id);

            if (conv && conv.messages.length > 0) {
                const trimResult = trimToTokenBudget(conv.messages);

                // Prepare summarisation trigger metadata (checked after streaming)
                if (trimResult.droppedCount > 0 && trimResult.newestTrimmedMessageId) {
                    summaryTriggerData = {
                        convId: conversation_id,
                        droppedMessages: trimResult.droppedMessages,
                        newestTrimmedMessageId: trimResult.newestTrimmedMessageId,
                        existingSummary: conv.summary ?? null,
                        summarisedUpToId: conv.summarised_up_to_message_id ?? null,
                    };
                }

                // Inject summary if we had to trim and one exists
                history =
                    trimResult.droppedCount > 0 && conv.summary
                        ? injectSummary(conv.summary, trimResult.keptMessages)
                        : trimResult.keptMessages;
            }
        }

        // ── Step 4: Classify intent ───────────────────────────────────────────
        const classification = await classifyIntent(message, history);

        // ── Step 5: Stream response ───────────────────────────────────────────
        const readable = await orchestrate(classification, message, history, conversation_id);

        // ── Step 6: Trigger background summarisation (fire-and-forget) ────────
        if (summaryTriggerData) {
            maybeTriggerSummarization(summaryTriggerData);
        }

        return new Response(readable, { headers: SSE_HEADERS });
    } catch (err) {
        console.error("[/api/chat] Error:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
