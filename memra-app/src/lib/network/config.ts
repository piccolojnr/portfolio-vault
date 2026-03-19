/**
 * lib/config.ts
 * =============
 * Backend URL and runtime config fetcher.
 *
 * getRuntimeConfig() is called server-side only (from /api/chat) to pull
 * decrypted API keys, model selections, and system prompt from the Python
 * backend.  It is never called from the browser.
 */

import { withRetry } from "./utils";

export const RAG_BACKEND_URL = process.env.RAG_BACKEND_URL ?? "http://localhost:8000";

export interface RuntimeConfig {
    anthropic_api_key: string;
    openai_api_key: string;
    anthropic_model: string;
    openai_model: string;
    system_prompt: string;
    classifier_anthropic_model: string;
    classifier_openai_model: string;
    summarizer_anthropic_model: string;
    summarizer_openai_model: string;
}

let configCache: RuntimeConfig | null = null
let cacheExpiry = 0
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
    if (configCache && Date.now() < cacheExpiry) return configCache
    configCache = await withRetry(
        async () => {
            const res = await fetch(`${RAG_BACKEND_URL}/api/v1/settings/runtime`);
            if (!res.ok) throw new Error(`Failed to fetch runtime config: ${res.status}`);
            return res.json() as Promise<RuntimeConfig>;
        },
        { label: "getRuntimeConfig" },
    );

    cacheExpiry = Date.now() + CACHE_TTL
    return configCache

}
