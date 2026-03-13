/**
 * app/api/chat/route.ts
 * ---------------------
 * POST /api/chat
 *
 * Request body:
 *   { message: string, history: { role: "user"|"assistant", content: string }[] }
 *
 * What happens here:
 *   1. Retrieve relevant chunks from Qdrant (RAG)
 *   2. Build a prompt: system + retrieved context + conversation history
 *   3. Stream the response from Claude back to the browser
 *
 * Why streaming?
 *   Without it the browser waits for the full response before showing anything.
 *   With streaming, words appear as they're generated — much better UX.
 *
 * Why a server route instead of calling APIs from the browser?
 *   API keys (OpenAI, Anthropic, Qdrant) would be visible to anyone who
 *   opens DevTools. Server routes keep them private.
 */

import Anthropic from "@anthropic-ai/sdk";
import { retrieve, formatContext } from "@/lib/retrieval";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Daud Rahim's personal career assistant. You have been given relevant excerpts from his portfolio vault — his bio, skills, experience, and project overviews.

Your job:
- Answer questions about his background, skills, and projects with specificity
- Draft cover letters, resume sections, and bios on his behalf (use "I", "my", "me")
- Help him prepare for interviews with concrete STAR-format answers
- Identify which projects to highlight for a given role
- Write LinkedIn posts or professional summaries

Rules:
- Use ONLY the provided context to answer. Don't invent details.
- Be specific — use numbers, project names, technologies when they appear in the context.
- If the context doesn't cover the question, say so and suggest what to ask instead.
- When drafting documents, write in first person as Daud.`;

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();

        // ── Step 1: Retrieve relevant chunks from Qdrant ──────────────────
        // We retrieve 5 chunks. This is a tunable parameter:
        // - Too few: might miss relevant context
        // - Too many: adds noise, costs more tokens, can confuse the model
        const chunks = await retrieve(message, 5);
        const context = formatContext(chunks);

        // Log what was retrieved (useful during development)
        console.log(`[RAG] Query: "${message}"`);
        console.log(`[RAG] Retrieved ${chunks.length} chunks:`);
        chunks.forEach((c, i) => {
            console.log(`  ${i + 1}. [${c.score.toFixed(3)}] ${c.source} / ${c.heading}`);
        });

        // ── Step 2: Build the messages array ──────────────────────────────
        // Structure:
        //   system prompt (always)
        //   + conversation history (previous turns)
        //   + current user message (with retrieved context prepended)
        //
        // We inject the context into the USER message, not the system prompt.
        // This keeps the system prompt clean and makes the context feel fresh
        // and specific to each query.

        const messages = [
            // Previous conversation turns
            ...history,
            // Current turn — context + question together
            {
                role: "user" as const,
                content: `Relevant context from my portfolio vault:\n\n${context}\n\n---\n\n${message}`,
            },
        ];

        // ── Step 3: Stream Claude's response ──────────────────────────────
        // We use the Vercel AI streaming pattern:
        // Claude streams tokens → we forward them as Server-Sent Events → browser renders live

        const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages,
        });

        // Create a ReadableStream that forwards Claude's tokens to the browser
        const readable = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();

                for await (const event of stream) {
                    if (
                        event.type === "content_block_delta" &&
                        event.delta.type === "text_delta"
                    ) {
                        // Send each text chunk as a Server-Sent Event
                        const data = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
                        controller.enqueue(encoder.encode(data));
                    }
                }

                // Signal end of stream
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err) {
        console.error("[/api/chat] Error:", err);
        return new Response(JSON.stringify({ error: "Something went wrong" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}