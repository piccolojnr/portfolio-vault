/**
 * app/api/chat/route.ts
 * ---------------------
 * POST /api/chat
 *
 * Request body:
 *   { message: string, history: { role: "user"|"assistant", content: string }[] }
 *
 * What happens here:
 *   1. Retrieve relevant chunks from RAG backend
 *   2. Build a prompt: system + retrieved context + conversation history
 *   3. Stream the response from Claude (Anthropic) or GPT-4o (OpenAI)
 *
 * LLM Selection:
 *   - Prefers Anthropic (Claude Sonnet) if ANTHROPIC_API_KEY is set
 *   - Falls back to OpenAI (GPT-4o) if only OPENAI_API_KEY is set
 *   - Throws error if neither is available
 *
 * Why streaming?
 *   Without it the browser waits for the full response before showing anything.
 *   With streaming, words appear as they're generated — much better UX.
 *
 * Why a server route instead of calling APIs from the browser?
 *   API keys would be visible to anyone who opens DevTools. Server routes keep them private.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { retrieve, formatContext, type RetrieveResponse } from "@/lib/retrieval";
import {
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    getLLMProvider,
    SYSTEM_PROMPT,
    LLM_CONFIG,
    validateConfig,
} from "@/lib/config";

// Validate config on server startup
validateConfig();

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();

        // ── Step 1: Retrieve relevant chunks from Python RAG backend ──────
        const ragResult: RetrieveResponse = await retrieve(message, 5);
        const context = formatContext(ragResult.retrieved_chunks);

        // Log what was retrieved (useful during development)
        console.log(`[RAG] Query: "${message}"`);
        console.log(`[RAG] Retrieved ${ragResult.retrieved_chunks.length} chunks:`);
        ragResult.retrieved_chunks.forEach((c, i) => {
            console.log(`  ${i + 1}. [${c.similarity.toFixed(3)}] ${c.source} / ${c.heading}`);
        });

        // ── Step 2: Build the messages array ──────────────────────────────
        const messages = [
            ...history,
            {
                role: "user" as const,
                content: `Relevant context from my portfolio vault:\n\n${context}\n\n---\n\n${message}`,
            },
        ];

        // ── Step 3: Stream the response ───────────────────────────────────
        // Determine which LLM to use based on available API keys
        const provider = getLLMProvider();

        let readable: ReadableStream<Uint8Array>;

        if (provider === "anthropic" && anthropic) {
            readable = streamAnthropicResponse(messages);
        } else if (provider === "openai" && openai) {
            readable = await streamOpenAIResponse(messages);
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

/**
 * Stream response from Claude (Anthropic)
 */
function streamAnthropicResponse(
    messages: Array<{ role: "user" | "assistant"; content: string }>
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

            try {
                for await (const event of stream) {
                    if (
                        event.type === "content_block_delta" &&
                        event.delta.type === "text_delta"
                    ) {
                        const data = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}

/**
 * Stream response from OpenAI (GPT-4o)
 */
async function streamOpenAIResponse(
    messages: Array<{ role: "user" | "assistant"; content: string }>
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

            try {
                for await (const chunk of stream) {
                    const text = chunk.choices[0]?.delta?.content;
                    if (text) {
                        const data = `data: ${JSON.stringify({ text })}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}