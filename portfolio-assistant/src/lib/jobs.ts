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
  const url = `/api/admin/jobs${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
  return res.json();
}

export async function getStats(): Promise<JobStats> {
  const res = await fetch("/api/admin/jobs/stats");
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function retryJob(id: string): Promise<void> {
  const res = await fetch(`/api/admin/jobs/${id}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to retry job: ${res.status}`);
}
