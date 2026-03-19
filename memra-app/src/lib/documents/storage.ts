/**
 * lib/storage.ts
 * ==============
 * Client helper for resolving stored file paths to public URLs.
 */

import { apiFetch } from "@/lib/network/api";

export async function getFileUrl(filePath: string): Promise<string | null> {
  const data = await apiFetch<{ url: string | null }>(
    `/api/storage/url?path=${encodeURIComponent(filePath)}`
  ).catch(() => null);
  return data?.url ?? null;
}
