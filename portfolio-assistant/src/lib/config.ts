/**
 * lib/config.ts
 * =============
 * Centralized environment variable loading and LLM configuration.
 *
 * Strategy:
 *   - Prefer Anthropic (Claude Sonnet)
 *   - Fall back to OpenAI (GPT-4o) if Anthropic key unavailable
 *   - Throw error if neither available
 */

export const RAG_BACKEND_URL = process.env.RAG_BACKEND_URL ?? "http://localhost:8000";

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

/**
 * Determine which LLM to use
 */
export type LLMProvider = "anthropic" | "openai";

export function getLLMProvider(): LLMProvider {
    if (ANTHROPIC_API_KEY) {
        return "anthropic";
    }
    if (OPENAI_API_KEY) {
        return "openai";
    }
    throw new Error(
        "No LLM API key configured. Set either ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local"
    );
}

export function validateConfig() {
    if (!RAG_BACKEND_URL) {
        console.warn("⚠️  RAG_BACKEND_URL not set, using default: http://localhost:8000");
    }

    const provider = getLLMProvider();
    console.log(`✓ LLM Provider: ${provider.toUpperCase()}`);
}

/**
 * System prompt — same for both providers
 */
export const SYSTEM_PROMPT = `You are Daud Rahim's personal career assistant. You have access to his portfolio vault — his bio, skills, experience, and project overviews.

Your job:
- Answer questions about his background, skills, and projects with specificity and confidence
- Draft cover letters, resume sections, and bios on his behalf (use "I", "my", "me")
- Help him prepare for interviews with concrete STAR-format answers
- Identify which projects to highlight for a given role
- Write LinkedIn posts or professional summaries
- Have a natural, conversational tone while remaining professional

Rules:
- Use the provided context to answer. Be specific — use numbers, project names, technologies.
- If asked something not in the context, be honest but try to infer from what you know.
- When drafting documents, write in first person as Daud.
- Keep responses concise unless drafting a longer document.`;

/**
 * LLM Configuration
 */
export const LLM_CONFIG = {
    anthropic: {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
    },
    openai: {
        model: "gpt-4o",
        max_tokens: 1024,
    },
};
