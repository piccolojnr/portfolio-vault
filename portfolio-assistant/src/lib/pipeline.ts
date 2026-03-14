/**
 * lib/pipeline.ts
 * ===============
 * Typed API client for the pipeline control panel.
 * All calls go through Next.js proxy routes (/api/pipeline/...).
 */

export interface PipelineRunSummary {
  run_id: string;
  status: string;
  triggered_by: string;
  chunk_count: number | null;
  token_count: number | null;
  cost_usd: number | null;
  model: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface PipelineRunList {
  items: PipelineRunSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CostEstimate {
  doc_count: number;
  chunk_count: number;
  token_count: number;
  estimated_cost_usd: number;
  model: string;
}

export type PipelineEvent =
  | { event: "run_id"; run_id: string }
  | { event: "started"; doc_count: number; run_id: string }
  | { event: "chunked"; chunk_count: number }
  | { event: "embedded"; chunk_count: number }
  | { event: "done"; chunk_count: number; run_id: string }
  | { event: "error"; message: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function listRuns(page = 1, pageSize = 20): Promise<PipelineRunList> {
  return apiFetch(`/api/pipeline/runs?page=${page}&page_size=${pageSize}`);
}

export function getRun(runId: string): Promise<PipelineRunSummary> {
  return apiFetch(`/api/pipeline/runs/${encodeURIComponent(runId)}`);
}

export function getCostEstimate(): Promise<CostEstimate> {
  return apiFetch("/api/pipeline/cost-estimate");
}

/**
 * Trigger a pipeline run and stream SSE events.
 * Calls onEvent for each received event; calls onDone when the stream closes.
 */
export async function runPipeline(
  onEvent: (ev: PipelineEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/pipeline/run", { method: "POST" });
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!res.ok || !res.body) {
    onError(new Error(`${res.status}: failed to start pipeline`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice("data:".length).trim();
        try {
          onEvent(JSON.parse(json) as PipelineEvent);
        } catch {
          // ignore malformed
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  onDone();
}
