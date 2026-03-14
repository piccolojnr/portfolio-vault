/**
 * lib/token-budget.ts
 * -------------------
 * Token-aware history trimming using js-tiktoken (cl100k_base encoding).
 *
 * Before every chat completion, we count the tokens in the full conversation
 * history and walk backwards from the most recent message, keeping messages
 * until the budget is exhausted. Older messages that don't fit are returned
 * as `droppedMessages` — they stay in the database, they just won't be sent
 * to the LLM this turn.
 *
 * Per-message token cost:
 *   content tokens  +  ROLE_OVERHEAD (4)  — matches OpenAI's counting spec
 *   (cl100k_base is used by GPT-4 and Claude uses a similar BPE tokenizer,
 *   so this is a good-enough approximation for both providers)
 */

import { getEncoding } from "js-tiktoken";
import type { MessageRead } from "./conversations";
import type { ChatMessage } from "./chat-pipeline";

// ── Config ────────────────────────────────────────────────────────────────────

/** Tokens reserved for the history portion of the prompt (default). */
export const DEFAULT_HISTORY_BUDGET = 3000;

/** Extra tokens counted per message to account for role/structure overhead. */
const ROLE_OVERHEAD = 4;

// ── Encoder (module-level singleton, initialised once) ────────────────────────

const enc = getEncoding("cl100k_base");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrimResult {
    /** Messages that fit within the budget — what gets sent to the LLM. */
    keptMessages: ChatMessage[];
    /** Messages that were cut — still in DB, needed for summarisation trigger. */
    droppedMessages: MessageRead[];
    droppedCount: number;
    /** ID of the most recently dropped message (for summarisation trigger). */
    newestTrimmedMessageId: string | null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Count the tokens in an array of messages (content + role overhead each).
 */
export function countTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, m) => {
        return total + enc.encode(m.content).length + ROLE_OVERHEAD;
    }, 0);
}

/**
 * Walk `messages` backwards, keeping the most recent ones that fit within
 * `budget` tokens. Returns kept + dropped + metadata.
 *
 * @param messages  Full history from DB (ordered oldest → newest, with IDs).
 * @param budget    Token ceiling for the kept portion (default 3000).
 */
export function trimToTokenBudget(
    messages: MessageRead[],
    budget = DEFAULT_HISTORY_BUDGET,
): TrimResult {
    let tokensAccumulated = 0;
    let splitIndex = messages.length; // exclusive upper bound of dropped slice

    // Walk from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
        const msgTokens = enc.encode(messages[i].content).length + ROLE_OVERHEAD;
        if (tokensAccumulated + msgTokens > budget) {
            splitIndex = i + 1; // everything before this index is dropped
            break;
        }
        tokensAccumulated += msgTokens;
        splitIndex = i; // keep expanding the kept window
    }

    const droppedMessages = messages.slice(0, splitIndex);
    const keptRaw = messages.slice(splitIndex);

    const keptMessages: ChatMessage[] = keptRaw.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
    }));

    const newestTrimmedMessageId =
        droppedMessages.length > 0
            ? droppedMessages[droppedMessages.length - 1].id
            : null;

    return {
        keptMessages,
        droppedMessages,
        droppedCount: droppedMessages.length,
        newestTrimmedMessageId,
    };
}
