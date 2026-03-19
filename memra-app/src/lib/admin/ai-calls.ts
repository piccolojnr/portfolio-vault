import { apiFetch } from "@/lib/network/api";

export interface AiCall {
  id: string;
  call_type: string;
  model: string;
  provider: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  job_id: string | null;
  conversation_id: string | null;
  doc_id: string | null;
  created_at: string;
}

export interface AiCallTypeStats {
  call_type: string;
  calls: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AiCallStats {
  total_calls: number;
  total_cost_usd: number;
  by_type: AiCallTypeStats[];
}

export async function getAiCalls(params?: {
  call_type?: string;
  limit?: number;
  offset?: number;
}): Promise<AiCall[]> {
  const qs = new URLSearchParams();
  if (params?.call_type) qs.set("call_type", params.call_type);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  return apiFetch(`/api/admin/ai-calls${qs.toString() ? `?${qs}` : ""}`);
}

export async function getAiCallStats(): Promise<AiCallStats> {
  return apiFetch("/api/admin/ai-calls/stats");
}
