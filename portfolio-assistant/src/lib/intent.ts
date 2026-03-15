/**
 * lib/intent.ts
 * -------------
 * Fast intent classification for incoming chat messages.
 *
 * Before any RAG retrieval or generation happens, we run a single cheap
 * API call (Haiku) to decide what kind of response is needed. This lets
 * the pipeline skip unnecessary work — no vector search for "thank you".
 *
 * Four intents:
 *   conversational — small talk, greetings, thanks, short reactions
 *   retrieval      — questions about Daud's background/skills/projects
 *   document       — explicit request to generate CV / cover letter / bio
 *   refinement     — modify / improve a document already in the conversation
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { RuntimeConfig } from "./config";

// ── Public types ─────────────────────────────────────────────────────────────

export type Intent = "conversational" | "retrieval" | "document" | "refinement";

export interface Classification {
    /** Detected intent of the user's message. */
    intent: Intent;
    /** Whether vault chunks should be retrieved before responding. */
    needs_rag: boolean;
    /** Whether a generated document exists in recent conversation history. */
    has_prior_document: boolean;
}

// ── Classifier config ─────────────────────────────────────────────────────────


const CLASSIFIER_SYSTEM = `You are an intent classifier for a career assistant chatbot that helps a user named Daud with his portfolio, CV, cover letters, and job applications.

Classify the user's current message into exactly one intent:
- "conversational": small talk, greetings, thanks, short reactions, clarifying questions about the assistant itself
- "retrieval": questions about Daud's experience, skills, projects, background, or anything requiring portfolio information
- "document": explicit request to generate a new CV, cover letter, resume, or bio from scratch
- "refinement": request to modify, shorten, improve, or extend a document already in the conversation; OR a follow-up that references a previously generated document

Also output:
- needs_rag: true if vault chunks should be retrieved (true for retrieval/document; false for conversational; conditionally true for refinement if the request needs new information, e.g. "add my kiosk project" — true, "make it shorter" — false)
- has_prior_document: true if there is a <document ...> block in the recent conversation history

Respond with valid JSON only. No markdown fences, no explanation. Example:
{"intent":"retrieval","needs_rag":true,"has_prior_document":false}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if any assistant message in history contains a <document> block. */
function scanForDocument(history: Array<{ role: string; content: string }>): boolean {
    return history.some((m) => m.role === "assistant" && m.content.includes("<document"));
}

/** Trims history to the last N messages to keep the classifier prompt small. */
function recentHistory(
    history: Array<{ role: string; content: string }>,
    n = 4,
): Array<{ role: string; content: string }> {
    return history.slice(-n);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Classifies a user message into an intent + retrieval metadata.
 *
 * Falls back to `{ intent: "retrieval", needs_rag: true }` if the classifier
 * call fails or returns unparseable JSON — safe over-retrieval beats silent
 * context loss.
 */
export async function classifyIntent(
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    config: RuntimeConfig,
): Promise<Classification> {
    const priorDocInHistory = scanForDocument(history);

    const fallback: Classification = {
        intent: "retrieval",
        needs_rag: true,
        has_prior_document: priorDocInHistory,
    };

    if (!config.anthropic_api_key && !config.openai_api_key) return fallback;

    const context = recentHistory(history);
    const userContent =
        context.length > 0
            ? `Conversation history (last ${context.length} messages):\n${JSON.stringify(context, null, 2)}\n\nCurrent message: ${message}`
            : `Current message: ${message}`;

    try {
        const text = config.anthropic_api_key
            ? await classifyWithAnthropic(userContent, config.anthropic_api_key, config.classifier_anthropic_model)
            : await classifyWithOpenAI(userContent, config.openai_api_key, config.classifier_openai_model);

        const parsed = JSON.parse(text) as Classification;

        // Ground-truth override: if we can see a document in history, trust that
        // over the LLM's answer (it only saw the last 4 messages).
        parsed.has_prior_document = parsed.has_prior_document || priorDocInHistory;

        console.log(`[intent] ${parsed.intent} | needs_rag=${parsed.needs_rag} | prior_doc=${parsed.has_prior_document}`);
        return parsed;
    } catch (err) {
        console.warn("[intent] Classification failed, using fallback:", err);
        return fallback;
    }
}

async function classifyWithAnthropic(userContent: string, apiKey: string, model: string): Promise<string> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model,
        max_tokens: 128,
        system: CLASSIFIER_SYSTEM,
        messages: [{ role: "user", content: userContent }],
    });
    return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
}

async function classifyWithOpenAI(userContent: string, apiKey: string, model: string): Promise<string> {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
        model,
        max_tokens: 128,
        messages: [
            { role: "system", content: CLASSIFIER_SYSTEM },
            { role: "user", content: userContent },
        ],
    });
    return response.choices[0]?.message?.content ?? "";
}
