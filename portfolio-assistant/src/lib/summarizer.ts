/**
 * lib/summarizer.ts
 * -----------------
 * Background summarisation job for long conversations.
 *
 * When trimming occurs, the messages that were cut are lost from the LLM's
 * context window. This module produces a 3–5 sentence rolling summary of
 * those dropped messages and writes it back to the DB, so future requests
 * can inject it as "[Earlier context: ...]".
 *
 * Key design rules:
 *   - Never await this from the request path — fire-and-forget only.
 *   - Never regenerate the full conversation. Always extend from the existing
 *     summary, processing only the newly-trimmed messages.
 *   - Only run if newestTrimmedMessageId !== summarisedUpToId (i.e. the
 *     summary is stale) AND more than MIN_DROPPED_TO_SUMMARISE were cut.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ANTHROPIC_API_KEY, OPENAI_API_KEY, RAG_BACKEND_URL } from "./config";
import type { MessageRead } from "./conversations";

// ── Config ────────────────────────────────────────────────────────────────────

/** Only summarise if at least this many messages were trimmed. */
const MIN_DROPPED_TO_SUMMARISE = 5;

const SUMMARISER_MODELS = {
    anthropic: "claude-haiku-4-5-20251001",
    openai: "gpt-4o-mini",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SummaryTrigger {
    convId: string;
    droppedMessages: MessageRead[];
    newestTrimmedMessageId: string;
    existingSummary: string | null;
    summarisedUpToId: string | null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget — call this after streaming finishes.
 * Returns immediately; summarisation runs in the background.
 */
export function maybeTriggerSummarization(trigger: SummaryTrigger): void {
    if (trigger.droppedMessages.length <= MIN_DROPPED_TO_SUMMARISE) return;
    if (trigger.newestTrimmedMessageId === trigger.summarisedUpToId) return;

    // Intentionally not awaited — runs after the response is already sent
    runSummarization(trigger).catch((err) =>
        console.warn("[summarizer] Background job failed:", err),
    );
}

// ── Implementation ────────────────────────────────────────────────────────────

async function runSummarization(trigger: SummaryTrigger): Promise<void> {
    const { convId, droppedMessages, newestTrimmedMessageId, existingSummary } = trigger;

    const prompt = buildPrompt(droppedMessages, existingSummary);

    const newSummary = ANTHROPIC_API_KEY
        ? await summariseWithAnthropic(prompt)
        : await summariseWithOpenAI(prompt);

    await persistSummary(convId, newSummary, newestTrimmedMessageId);
    console.log(`[summarizer] Updated summary for conversation ${convId}`);
}

/**
 * Builds the summarisation prompt.
 * Always extends from the existing summary — never starts from scratch.
 */
function buildPrompt(dropped: MessageRead[], existingSummary: string | null): string {
    const transcript = dropped
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

    const seedSection = existingSummary
        ? `Existing summary (do not repeat this verbatim — extend it):\n${existingSummary}\n\n`
        : "";

    return (
        `${seedSection}` +
        `New messages to incorporate:\n\n${transcript}\n\n` +
        `Write an updated 3–5 sentence summary of this conversation so far. ` +
        `Cover: the user's goal, any documents generated (type + key decisions), ` +
        `preferences stated, and important facts established. ` +
        `Write in present tense. Reply with only the summary text.`
    );
}

async function summariseWithAnthropic(prompt: string): Promise<string> {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
        model: SUMMARISER_MODELS.anthropic,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
    });
    return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
}

async function summariseWithOpenAI(prompt: string): Promise<string> {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const response = await client.chat.completions.create({
        model: SUMMARISER_MODELS.openai,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
    });
    return (response.choices[0]?.message?.content ?? "").trim();
}

/** Writes the new summary back to the Python backend via the Next.js API proxy. */
async function persistSummary(
    convId: string,
    summary: string,
    summarisedUpToMessageId: string,
): Promise<void> {
    await fetch(`${RAG_BACKEND_URL}/api/v1/conversations/${convId}/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, summarised_up_to_message_id: summarisedUpToMessageId }),
    });
}
