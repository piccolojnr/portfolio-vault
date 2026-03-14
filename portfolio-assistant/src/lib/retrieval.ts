/**
 * lib/retrieval.ts
 * ----------------
 * The RAG client. Calls the Python backend for retrieval only.
 * Server-side only (in the API route). Never imported by the browser.
 *
 * Why delegate to Python?
 *   - Centralized embeddings/retrieval logic (no duplication)
 *   - Single source of truth for chunking, vector search, source capping
 *   - Python FastAPI handles all the sophisticated RAG features
 *
 * One operation:
 *   retrieve(query, n) → call Python /retrieve endpoint, return chunks
 *
 * LLM generation happens in route.ts (streamed, with conversation history).
 * The Python /query endpoint also generates answers but is not used here
 * to avoid a duplicate LLM call per message.
 */

import { RAG_BACKEND_URL } from "./config";

export interface RetrievedChunk {
    content: string;
    source: string;
    heading: string;
    similarity: number;
}

export interface RetrieveResponse {
    question: string;
    retrieved_chunks: RetrievedChunk[];
    mode: "real" | "demo";
}

/**
 * retrieve — call the Python RAG backend (retrieval only, no LLM)
 *
 * The Python server handles:
 *   1. Embedding the query via OpenAI or demo vectors
 *   2. Searching Qdrant (or ChromaDB) with intent-based filtering
 *   3. Applying source capping (max N chunks per source)
 *   4. Falling back to unfiltered search if confidence is low
 *
 * We get back the chunks; LLM generation happens in route.ts so that
 * streaming and conversation history are handled in a single place.
 */
export async function retrieve(
    query: string,
    n: number = 5
): Promise<RetrieveResponse> {
    const response = await fetch(`${RAG_BACKEND_URL}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, n_results: n }),
    });

    if (!response.ok) {
        throw new Error(`RAG backend error: ${response.statusText}`);
    }

    return response.json() as Promise<RetrieveResponse>;
}

/**
 * formatContext — turn retrieved chunks into a readable context block
 * that goes into the LLM prompt.
 */
export function formatContext(chunks: RetrievedChunk[]): string {
    return chunks
        .map(
            (c, i) =>
                `[${i + 1}] Source: ${c.source} / ${c.heading}\nScore: ${c.similarity.toFixed(3)}\n${c.content}`
        )
        .join("\n\n---\n\n");
}