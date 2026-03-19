/**
 * lib/documents.ts
 * ================
 * Typed API client for corpus document management.
 * All calls go through Next.js proxy routes (/api/documents/...).
 */

import { apiFetch } from "@/lib/network/api";


export interface CorpusDocSummary {
  id: string;
  slug: string;
  type: string;
  title: string;
  created_at: string;
  updated_at: string;
  lightrag_status?: string;
  source_type: string;
  file_size?: number;
  mimetype?: string;
}

export interface PaginatedDocs {
  items: CorpusDocSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CorpusDocDetail extends CorpusDocSummary {
  extracted_text: string;
}

export interface CorpusDocCreate {
  slug: string;
  title: string;
  type: string;
  extracted_text?: string;
}

export interface CorpusDocUpdate {
  title?: string;
  extracted_text?: string;
  type?: string;
}

export function listDocuments(page = 1, pageSize = 20): Promise<PaginatedDocs> {
  return apiFetch(`/api/documents?page=${page}&page_size=${pageSize}`);
}

export function getDocument(slug: string): Promise<CorpusDocDetail> {
  return apiFetch(`/api/documents/${encodeURIComponent(slug)}`);
}

export function createDocument(data: CorpusDocCreate): Promise<CorpusDocDetail> {
  return apiFetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateDocument(
  slug: string,
  patch: CorpusDocUpdate
): Promise<CorpusDocDetail> {
  return apiFetch(`/api/documents/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteDocument(slug: string): Promise<void> {
  return apiFetch(`/api/documents/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}
