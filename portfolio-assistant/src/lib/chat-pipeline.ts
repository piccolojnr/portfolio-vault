/**
 * lib/chat-pipeline.ts
 * --------------------
 * Streaming response handlers for each classified intent.
 *
 * Each handler returns a ReadableStream<Uint8Array> emitting SSE events:
 *   data: {"text": "..."}           — streamed text delta
 *   data: {"saved": {"doc_type"}}   — emitted after DB persistence (if conversation_id given)
 *   data: [DONE]                    — end sentinel
 *
 * Intent → handler mapping:
 *   conversational  → no RAG, natural reply
 *   retrieval       → RAG on, answer from vault chunks
 *   document        → RAG on, generate formatted document
 *   refinement      → prior document as context, RAG only if needed
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { retrieve, formatContext } from "./retrieval";
import { type Classification } from "./intent";
import { type MessageMeta, type MessageRead } from "./conversations";
import { RAG_BACKEND_URL, type RuntimeConfig } from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

// ── LLM constants (not user-facing settings) ──────────────────────────────────

const MAX_TOKENS = 2000;

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Matches <document type="..." title="...">...</document> wrapper. */
const DOC_RE = /<document\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]+?)<\/document>/;

function extractDocType(content: string): string | null {
    return content.match(DOC_RE)?.[1] ?? null;
}

/** Finds the full content of the last assistant message containing a <document> block. */
function extractLastDocument(history: ChatMessage[]): string | null {
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === "assistant" && DOC_RE.test(msg.content)) {
            return msg.content;
        }
    }
    return null;
}

/** Persists user + assistant messages to the Python backend after streaming. */
async function persistMessages(
    convId: string,
    userMessage: string,
    assistantContent: string,
    docType: string | null,
    meta: MessageMeta | null = null,
): Promise<MessageRead | null> {
    const base = `${RAG_BACKEND_URL}/api/v1/conversations/${convId}/messages`;
    const headers = { "Content-Type": "application/json" };

    await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ role: "user", content: userMessage, doc_type: null }),
    });

    const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ role: "assistant", content: assistantContent, doc_type: docType, meta }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<MessageRead>;
}

/** Returns an enqueue function that UTF-8 encodes strings into the controller. */
function makeEnqueuer(controller: ReadableStreamDefaultController<Uint8Array>) {
    const encoder = new TextEncoder();
    return (data: string) => controller.enqueue(encoder.encode(data));
}

// ── LLM streaming ─────────────────────────────────────────────────────────────

/**
 * Streams a response from the configured LLM provider (Anthropic preferred,
 * OpenAI as fallback). Persists messages to DB after the stream completes.
 */
async function streamResponse(
    messages: ChatMessage[],
    userMessage: string,
    convId: string | undefined,
    config: RuntimeConfig,
    meta: MessageMeta | null = null,
): Promise<ReadableStream<Uint8Array>> {
    if (config.anthropic_api_key) {
        return streamAnthropic(messages, userMessage, convId, config, meta);
    }
    if (config.openai_api_key) {
        return streamOpenAI(messages, userMessage, convId, config, meta);
    }

    throw new Error(
        "No LLM provider available. Configure API keys in the settings page.",
    );
}

function streamAnthropic(
    messages: ChatMessage[],
    userMessage: string,
    convId: string | undefined,
    config: RuntimeConfig,
    meta: MessageMeta | null,
): ReadableStream<Uint8Array> {
    const client = new Anthropic({ apiKey: config.anthropic_api_key });
    const stream = client.messages.stream({
        model: config.anthropic_model,
        max_tokens: MAX_TOKENS,
        system: config.system_prompt,
        messages,
    });

    return new ReadableStream({
        async start(controller) {
            const enqueue = makeEnqueuer(controller);
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

                if (convId) {
                    const docType = extractDocType(accumulated);
                    const saved = await persistMessages(convId, userMessage, accumulated, docType, meta);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType, meta, id: saved?.id, created_at: saved?.created_at } })}\n\n`);
                }

                enqueue("data: [DONE]\n\n");
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}

async function streamOpenAI(
    messages: ChatMessage[],
    userMessage: string,
    convId: string | undefined,
    config: RuntimeConfig,
    meta: MessageMeta | null,
): Promise<ReadableStream<Uint8Array>> {
    const client = new OpenAI({ apiKey: config.openai_api_key });
    const stream = await client.chat.completions.create({
        model: config.openai_model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: config.system_prompt }, ...messages],
        stream: true,
    });

    return new ReadableStream({
        async start(controller) {
            const enqueue = makeEnqueuer(controller);
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
                    const docType = extractDocType(accumulated);
                    const saved = await persistMessages(convId, userMessage, accumulated, docType, meta);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType, meta, id: saved?.id, created_at: saved?.created_at } })}\n\n`);
                }

                enqueue("data: [DONE]\n\n");
                controller.close();
            } catch (err) {
                controller.error(err);
            }
        },
    });
}

// ── Intent handlers ───────────────────────────────────────────────────────────

async function handleConversational(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    config: RuntimeConfig,
): Promise<ReadableStream<Uint8Array>> {
    console.log("[chat] conversational — skipping RAG");
    const meta: MessageMeta = { intent: "conversational", rag_retrieved: false, chunks_count: 0 };
    return streamResponse([...history, { role: "user", content: message }], message, convId, config, meta);
}

async function handleRetrieval(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    config: RuntimeConfig,
): Promise<ReadableStream<Uint8Array>> {
    const ragResult = await retrieve(message, 5);
    const context = formatContext(ragResult.retrieved_chunks);
    console.log(`[chat] retrieval — ${ragResult.retrieved_chunks.length} chunks`);

    const messages: ChatMessage[] = [
        ...history,
        {
            role: "user",
            content: `Relevant context from my portfolio vault:\n\n${context}\n\n---\n\n${message}`,
        },
    ];

    const meta: MessageMeta = { intent: "retrieval", rag_retrieved: true, chunks_count: ragResult.retrieved_chunks.length };
    return streamResponse(messages, message, convId, config, meta);
}

async function handleDocument(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    config: RuntimeConfig,
): Promise<ReadableStream<Uint8Array>> {
    const ragResult = await retrieve(message, 5);
    const context = formatContext(ragResult.retrieved_chunks);
    console.log(`[chat] document — ${ragResult.retrieved_chunks.length} chunks`);

    const messages: ChatMessage[] = [
        ...history,
        {
            role: "user",
            content: `Relevant context from my portfolio vault:\n\n${context}\n\n---\n\n${message}`,
        },
    ];

    const meta: MessageMeta = { intent: "document", rag_retrieved: true, chunks_count: ragResult.retrieved_chunks.length };
    return streamResponse(messages, message, convId, config, meta);
}

async function handleRefinement(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    needsRag: boolean,
    config: RuntimeConfig,
): Promise<ReadableStream<Uint8Array>> {
    const priorDoc = extractLastDocument(history);
    let contextBlock = priorDoc
        ? `Here is the document you previously generated:\n\n${priorDoc}\n\n`
        : "";

    let chunksCount = 0;
    if (needsRag) {
        const ragResult = await retrieve(message, 5);
        chunksCount = ragResult.retrieved_chunks.length;
        const chunks = formatContext(ragResult.retrieved_chunks);
        contextBlock += `Additional context from my portfolio vault:\n\n${chunks}\n\n`;
        console.log(`[chat] refinement + RAG — ${ragResult.retrieved_chunks.length} chunks`);
    } else {
        console.log("[chat] refinement — no RAG, using prior document only");
    }

    const userContent = contextBlock
        ? `${contextBlock}---\n\nUser's request: ${message}`
        : message;

    const meta: MessageMeta = { intent: "refinement", rag_retrieved: needsRag, chunks_count: chunksCount };
    return streamResponse([...history, { role: "user", content: userContent }], message, convId, config, meta);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Routes a classified message to the appropriate handler and returns an SSE stream.
 */
export async function orchestrate(
    classification: Classification,
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    config: RuntimeConfig,
): Promise<ReadableStream<Uint8Array>> {
    const { intent, needs_rag } = classification;

    switch (intent) {
        case "conversational":
            return handleConversational(message, history, convId, config);
        case "retrieval":
            return handleRetrieval(message, history, convId, config);
        case "document":
            return handleDocument(message, history, convId, config);
        case "refinement":
            return handleRefinement(message, history, convId, needs_rag, config);
        default:
            // Exhaustiveness guard — unknown intent falls back to retrieval
            return handleRetrieval(message, history, convId, config);
    }
}
