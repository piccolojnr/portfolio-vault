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
import { type MessageMeta } from "./conversations";
import {
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    RAG_BACKEND_URL,
    getLLMProvider,
    SYSTEM_PROMPT,
    LLM_CONFIG,
} from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

// ── Lazy LLM clients ──────────────────────────────────────────────────────────

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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
        body: JSON.stringify({ role: "assistant", content: assistantContent, doc_type: docType, meta }),
    });
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
    meta: MessageMeta | null = null,
): Promise<ReadableStream<Uint8Array>> {
    const provider = getLLMProvider();

    if (provider === "anthropic" && anthropic) {
        return streamAnthropic(messages, userMessage, convId, meta);
    }
    if (provider === "openai" && openai) {
        return streamOpenAI(messages, userMessage, convId, meta);
    }

    throw new Error(
        "No LLM provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local",
    );
}

function streamAnthropic(
    messages: ChatMessage[],
    userMessage: string,
    convId: string | undefined,
    meta: MessageMeta | null,
): ReadableStream<Uint8Array> {
    const stream = anthropic!.messages.stream({
        model: LLM_CONFIG.anthropic.model,
        max_tokens: LLM_CONFIG.anthropic.max_tokens,
        system: SYSTEM_PROMPT,
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
                    await persistMessages(convId, userMessage, accumulated, docType, meta);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType, meta } })}\n\n`);
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
    meta: MessageMeta | null,
): Promise<ReadableStream<Uint8Array>> {
    const stream = await openai!.chat.completions.create({
        model: LLM_CONFIG.openai.model,
        max_tokens: LLM_CONFIG.openai.max_tokens,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
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
                    await persistMessages(convId, userMessage, accumulated, docType, meta);
                    enqueue(`data: ${JSON.stringify({ saved: { doc_type: docType, meta } })}\n\n`);
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

/**
 * conversational — no RAG, respond naturally.
 * Used for greetings, thanks, short reactions.
 */
async function handleConversational(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
): Promise<ReadableStream<Uint8Array>> {
    console.log("[chat] conversational — skipping RAG");
    const meta: MessageMeta = { intent: "conversational", rag_retrieved: false, chunks_count: 0 };
    return streamResponse([...history, { role: "user", content: message }], message, convId, meta);
}

/**
 * retrieval — RAG on, answer directly from vault chunks.
 * Used for questions about Daud's background, skills, projects.
 */
async function handleRetrieval(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
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
    return streamResponse(messages, message, convId, meta);
}

/**
 * document — RAG on, generate a formatted document (CV / cover letter / bio).
 * Same retrieval path as retrieval; the system prompt instructs the model
 * to wrap the output in a <document> block.
 */
async function handleDocument(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
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
    return streamResponse(messages, message, convId, meta);
}

/**
 * refinement — the prior document becomes context; RAG is only triggered
 * when the edit request needs new vault information (e.g. "add my kiosk project").
 */
async function handleRefinement(
    message: string,
    history: ChatMessage[],
    convId: string | undefined,
    needsRag: boolean,
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
    return streamResponse([...history, { role: "user", content: userContent }], message, convId, meta);
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
): Promise<ReadableStream<Uint8Array>> {
    const { intent, needs_rag } = classification;

    switch (intent) {
        case "conversational":
            return handleConversational(message, history, convId);
        case "retrieval":
            return handleRetrieval(message, history, convId);
        case "document":
            return handleDocument(message, history, convId);
        case "refinement":
            return handleRefinement(message, history, convId, needs_rag);
        default:
            // Exhaustiveness guard — unknown intent falls back to retrieval
            return handleRetrieval(message, history, convId);
    }
}
