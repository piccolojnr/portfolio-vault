import { apiFetch } from "@/lib/network/api";

export interface Job {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  error: string | null;
  error_trace: string | null;
  worker_id: string | null;
  created_at: string;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface JobStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
  retrying: number;
  worker_connected: boolean | null;
}

export async function getJobs(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Job[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  return apiFetch(`/api/admin/jobs${qs.toString() ? `?${qs}` : ""}`);
}

export async function getStats(): Promise<JobStats> {
  return apiFetch("/api/admin/jobs/stats");
}

export async function retryJob(id: string): Promise<void> {
  return apiFetch(`/api/admin/jobs/${id}/retry`, { method: "POST" });
}
