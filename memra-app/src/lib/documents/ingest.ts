/**
 * lib/ingest.ts
 * =============
 * Client helpers for file ingestion: hashing, duplicate-checking,
 * uploading, and status polling.
 */

import { apiFetch } from "@/lib/network/api";
import { getAccessToken } from "@/lib/auth";

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DuplicateCheckFile {
  filename: string;
  hash: string;
  size: number;
  mimetype: string;
}

export interface DuplicateCheckResult {
  filename: string;
  hash: string;
  status: "new" | "duplicate" | "unsupported";
  existing_title?: string;
}

export async function checkDuplicates(
  files: DuplicateCheckFile[]
): Promise<DuplicateCheckResult[]> {
  const data = await apiFetch<{ results: DuplicateCheckResult[] }>(
    "/api/documents/check-duplicates",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    }
  );
  return data.results;
}

export async function uploadDocument(
  file: File,
  hash: string
): Promise<{ id: string; slug: string; title: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("file_hash", hash);
  // Do NOT set Content-Type — browser adds multipart boundary automatically
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/documents/upload", { method: "POST", body: form, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`upload failed: ${text}`);
  }
  return res.json();
}

export async function getDocumentStatus(
  id: string
): Promise<{ status: string; error?: string }> {
  return apiFetch(`/api/documents/${encodeURIComponent(id)}/status`);
}

export async function reIngestDocument(id: string): Promise<void> {
  return apiFetch(`/api/documents/${encodeURIComponent(id)}/reingest`, {
    method: "POST",
  });
}
