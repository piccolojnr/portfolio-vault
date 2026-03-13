/**
 * lib/retrieval.ts
 * ----------------
 * The RAG client. Calls the Python backend for all RAG operations.
 * Server-side only (in the API route). Never imported by the browser.
 *
 * Why delegate to Python?
 *   - Centralized embeddings/retrieval logic (no duplication)
 *   - Single source of truth for chunking, vector search, source capping
 *   - Python FastAPI handles all the sophisticated RAG features
 *
 * One operation:
 *   retrieve(query, n) → call Python /query endpoint, return chunks + answer
 */

const RAG_BACKEND_URL = process.env.RAG_BACKEND_URL ?? "http://localhost:8000";

export interface RetrievedChunk {
    content: string;
    source: string;
    heading: string;
    similarity: number;
}

export interface RAGResponse {
    question: string;
    answer: string;
    retrieved_chunks: RetrievedChunk[];
    mode: "real" | "demo";
}

/**
 * retrieve — call the Python RAG backend
 *
 * The Python server handles:
 *   1. Embedding the query via OpenAI or demo vectors
 *   2. Searching Qdrant (or ChromaDB) with intent-based filtering
 *   3. Applying source capping (max N chunks per source)
 *   4. Falling back to unfiltered search if confidence is low
 *   5. Generating an answer via Anthropic or OpenAI
 *
 * We get back the full RAG result, which includes both the chunks
 * and a ready-to-use answer.
 */
export async function retrieve(
    query: string,
    n: number = 5
): Promise<RAGResponse> {
    const response = await fetch(`${RAG_BACKEND_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, n_results: n }),
    });

    if (!response.ok) {
        throw new Error(`RAG backend error: ${response.statusText}`);
    }

    return response.json() as Promise<RAGResponse>;
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