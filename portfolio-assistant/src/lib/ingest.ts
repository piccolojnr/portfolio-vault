/**
 * lib/ingest.ts
 * =============
 * Client helpers for file ingestion: hashing, duplicate-checking,
 * uploading, and status polling.
 */

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
  corpus_id: string,
  files: DuplicateCheckFile[]
): Promise<DuplicateCheckResult[]> {
  const res = await fetch("/api/documents/check-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ corpus_id, files }),
  });
  if (!res.ok) throw new Error(`check-duplicates: ${res.status}`);
  const data = await res.json();
  return data.results as DuplicateCheckResult[];
}

export async function uploadDocument(
  file: File,
  corpus_id: string,
  hash: string
): Promise<{ id: string; slug: string; title: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("corpus_id", corpus_id);
  form.append("file_hash", hash);
  // Do NOT set Content-Type — browser adds multipart boundary automatically
  const res = await fetch("/api/documents/upload", { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`upload failed: ${text}`);
  }
  return res.json();
}

export async function getDocumentStatus(
  id: string
): Promise<{ status: string; error?: string }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/status`);
  if (!res.ok) throw new Error(`status: ${res.status}`);
  return res.json();
}

export async function reIngestDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/reingest`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`reingest: ${res.status}`);
}
