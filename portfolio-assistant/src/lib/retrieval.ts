/**
 * lib/retrieval.ts
 * ----------------
 * The RAG core. Runs server-side only (in the API route).
 * Never imported by the browser.
 *
 * Two operations:
 *   embed(text)    → call OpenAI, get a 1536-dim vector
 *   retrieve(query, n) → embed query, search Qdrant, return top-n chunks
 */

import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
});

const COLLECTION = process.env.QDRANT_COLLECTION ?? "portfolio_vault";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export interface RetrievedChunk {
    content: string;
    source: string;
    heading: string;
    score: number;
}

/**
 * embed — convert a string to a 1536-dim vector via OpenAI
 */
export async function embed(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return response.data[0].embedding;
}

/**
 * retrieve — the heart of RAG
 *
 * 1. Embed the query
 * 2. Ask Qdrant: "find me the n most similar vectors"
 * 3. Return the chunks with their content + metadata
 *
 * Optional: pass a sourceFilter like "project_laundry_kiosk" to restrict
 * search to a specific vault file. This is the metadata filtering we
 * talked about — Qdrant evaluates it before the vector search.
 */
export async function retrieve(
    query: string,
    n: number = 5,
    sourceFilter?: string
): Promise<RetrievedChunk[]> {
    const queryVector = await embed(query);

    // Build optional payload filter
    const filter = sourceFilter
        ? {
            must: [
                {
                    key: "source",
                    match: { value: sourceFilter },
                },
            ],
        }
        : undefined;

    const results = await qdrant.search(COLLECTION, {
        vector: queryVector,
        limit: n,
        filter,
        with_payload: true,
    });

    return results.map((r) => ({
        content: r.payload?.content as string,
        source: r.payload?.source as string,
        heading: r.payload?.heading as string,
        score: r.score,
    }));
}

/**
 * formatContext — turn retrieved chunks into a readable context block
 * that goes into the LLM prompt.
 */
export function formatContext(chunks: RetrievedChunk[]): string {
    return chunks
        .map(
            (c, i) =>
                `[${i + 1}] Source: ${c.source} / ${c.heading}\n${c.content}`
        )
        .join("\n\n---\n\n");
}