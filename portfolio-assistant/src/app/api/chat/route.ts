/**
 * app/api/chat/route.ts
 * ---------------------
 * POST /api/chat
 *
 * Request body:
 *   {
 *     message: string,
 *     history: { role: "user"|"assistant", content: string }[],
 *     conversation_id?: string   // if set, messages are persisted to DB
 *   }
 *
 * What happens here:
 *   1. Retrieve relevant chunks from RAG backend
 *   2. Build a prompt: system + retrieved context + conversation history
 *   3. Stream the response from Claude (Anthropic) or GPT-4o (OpenAI)
 *   4. After streaming, persist user + assistant messages to Python DB (if conversation_id)
 *   5. Emit a final { saved: { doc_type } } SSE event so the frontend can update state
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { retrieve, formatContext, type RetrieveResponse } from "@/lib/retrieval";
import {
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    RAG_BACKEND_URL,
    getLLMProvider,
    SYSTEM_PROMPT,
    LLM_CONFIG,
    validateConfig,
} from "@/lib/config";

// Validate config on server startup
validateConfig();

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/** Regex to detect <document type="..." title="..."> wrapper */
const DOC_RE = /<document\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]+?)<\/document>/;

function extractDocument(content: string): { docType: string; title: string; body: string } | null {
    const m = content.match(DOC_RE);
    if (!m) return null;
    return { docType: m[1], title: m[2], body: m[3].trim() };
}

async function persistMessages(
    convId: string,
    userMessage: string,
    assistantContent: string,
    docType: string | null,
): Promise<void> {
    const base = `${RAG_BACKEND_URL}/api/v1/conversations/${convId}/messages`;
    const headers = { "Content-Type": "application/json" };

    await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ role: "user", content: userMessage, doc_type: null }),
    });

    await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ role: "assistant", content: assistantContent, doc_type: docType }),
    });
}

export async function POST(req: Request) {
    try {
        const { message, history, conversation_id } = await req.json();

        // ── Step 1: Retrieve relevant chunks ──────────────────────────────────
        const ragResult: RetrieveResponse = await retrieve(message, 5);
        const context = formatContext(ragResult.retrieved_chunks);

        console.log(`[RAG] Query: "${message}"`);
        console.log(`[RAG] Retrieved ${ragResult.retrieved_chunks.length} chunks`);

        // ── Step 2: Build the messages array ──────────────────────────────────
        const messages = [
            ...history,
            {
                role: "user" as const,
                content: `Relevant context from my portfolio vault:\n\n${context}\n\n---\n\n${message}`,
            },
        ];

        // ── Step 3: Stream + persist ───────────────────────────────────────────
        const provider = getLLMProvider();

        let readable: ReadableStream<Uint8Array>;

        if (provider === "anthropic" && anthropic) {
            readable = streamAnthropicResponse(messages, message, conversation_id);
        } else if (provider === "openai" && openai) {
            readable = await streamOpenAIResponse(messages, message, conversation_id);
        } else {
            throw new Error(
                "No LLM provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local"
            );
        }

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err) {
        console.error("[/api/chat] Error:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

function streamAnthropicResponse(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
    convId?: string,
): ReadableStream<Uint8Array> {
    const stream = anthropic!.messages.stream({
        model: LLM_CONFIG.anthropic.model,
        max_tokens: LLM_CONFIG.anthropic.max_tokens,
        system: SYSTEM_PROMPT,
        messages,
    });

    return new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const enqueue = (data: string) =>
                controller.enqueue(encoder.encode(data));

            let accumulated = "";
            try {
                for await (const event of stream) {
                    if (
                        event.type === "content_block_delta" &&
                        event.delta.type === "text_delta"
                    ) {
                        accumulated += event.delta.text;
                        enqueue(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
                    }
                }

                // Persist and emit saved event
                if (convId) {
                    const doc = extractDocument(accumulated);
                    const docType = doc?.docType ?? null;
                    await persistMessages(convId, userMessage, accumulated, docType);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType } })}\n\n`);
                }

                enqueue("data: [DONE]\n\n");
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}

async function streamOpenAIResponse(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
    convId?: string,
): Promise<ReadableStream<Uint8Array>> {
    const stream = await openai!.chat.completions.create({
        model: LLM_CONFIG.openai.model,
        max_tokens: LLM_CONFIG.openai.max_tokens,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
        ],
        stream: true,
    });

    return new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const enqueue = (data: string) =>
                controller.enqueue(encoder.encode(data));

            let accumulated = "";
            try {
                for await (const chunk of stream) {
                    const text = chunk.choices[0]?.delta?.content;
                    if (text) {
                        accumulated += text;
                        enqueue(`data: ${JSON.stringify({ text })}\n\n`);
                    }
                }

                if (convId) {
                    const doc = extractDocument(accumulated);
                    const docType = doc?.docType ?? null;
                    await persistMessages(convId, userMessage, accumulated, docType);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType } })}\n\n`);
                }

                enqueue("data: [DONE]\n\n");
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}
