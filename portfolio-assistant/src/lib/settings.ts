/**
 * lib/settings.ts
 * ===============
 * Typed API client for the settings page.
 */

export interface SettingsRead {
  openai_api_key_set: boolean;
  anthropic_api_key_set: boolean;
  embedding_model: string;
  anthropic_model: string;
  openai_model: string;
  cost_limit_usd: number;
  system_prompt: string;
  classifier_anthropic_model: string;
  classifier_openai_model: string;
  summarizer_anthropic_model: string;
  summarizer_openai_model: string;
  embedding_model_options: string[];
  anthropic_model_options: string[];
  openai_model_options: string[];
}

export interface SettingsUpdate {
  openai_api_key?: string;
  anthropic_api_key?: string;
  embedding_model?: string;
  anthropic_model?: string;
  openai_model?: string;
  cost_limit_usd?: number;
  system_prompt?: string;
  classifier_anthropic_model?: string;
  classifier_openai_model?: string;
  summarizer_anthropic_model?: string;
  summarizer_openai_model?: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getSettings(): Promise<SettingsRead> {
  return apiFetch("/api/settings");
}

export function updateSettings(patch: SettingsUpdate): Promise<SettingsRead> {
  return apiFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
