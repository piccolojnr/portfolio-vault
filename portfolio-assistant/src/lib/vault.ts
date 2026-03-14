/**
 * lib/vault.ts
 * ============
 * Typed API client for vault document management.
 * All calls go through Next.js proxy routes (/api/vault/...).
 */

export interface VaultDocSummary {
  id: string;
  slug: string;
  type: string;
  title: string;
  updated_at: string;
}

export interface PaginatedDocs {
  items: VaultDocSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface VaultDocDetail extends VaultDocSummary {
  content: string;
}

export interface VaultDocCreate {
  slug: string;
  title: string;
  type: string;
  content?: string;
}

export interface VaultDocUpdate {
  title?: string;
  content?: string;
}

export interface ReindexResponse {
  run_id: string;
  status: string;
}

export interface ReindexStatus {
  run_id: string;
  status: string;
  chunk_count: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function listDocuments(page = 1, pageSize = 20): Promise<PaginatedDocs> {
  return apiFetch(`/api/vault/documents?page=${page}&page_size=${pageSize}`);
}

export function getDocument(slug: string): Promise<VaultDocDetail> {
  return apiFetch(`/api/vault/documents/${encodeURIComponent(slug)}`);
}

export function createDocument(data: VaultDocCreate): Promise<VaultDocDetail> {
  return apiFetch("/api/vault/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateDocument(
  slug: string,
  patch: VaultDocUpdate
): Promise<VaultDocDetail> {
  return apiFetch(`/api/vault/documents/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteDocument(slug: string): Promise<void> {
  return apiFetch(`/api/vault/documents/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export function triggerReindex(): Promise<ReindexResponse> {
  return apiFetch("/api/vault/reindex", { method: "POST" });
}

export function getReindexStatus(runId: string): Promise<ReindexStatus> {
  return apiFetch(`/api/vault/reindex/${encodeURIComponent(runId)}`);
}
