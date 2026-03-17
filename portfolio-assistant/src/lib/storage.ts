/**
 * lib/storage.ts
 * ==============
 * Client helper for resolving stored file paths to public URLs.
 */

export async function getFileUrl(filePath: string): Promise<string | null> {
  const res = await fetch(`/api/storage/url?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) return null;
  return (await res.json()).url ?? null;
}
