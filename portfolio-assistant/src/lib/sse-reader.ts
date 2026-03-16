import type { MessageMeta } from "@/lib/conversations";

export interface SSESavedPayload {
  doc_type: string | null;
  meta: MessageMeta | null;
  id?: string;
  created_at?: string;
}

export interface SSECallbacks {
  onText: (text: string) => void;
  onSaved: (saved: SSESavedPayload) => void;
  onError: (error: { message: string; stage: string }) => void;
}

/**
 * Reads an SSE stream body to completion.
 * Returns `{ receivedDone: true }` when the `[DONE]` sentinel is seen,
 * `{ receivedDone: false }` if the stream closed without it.
 */
export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<{ receivedDone: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let receivedDone = false;

  outer: while (true) {
    if (signal?.aborted) break;

    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);

      if (payload === "[DONE]") {
        receivedDone = true;
        break outer;
      }

      try {
        const parsed = JSON.parse(payload);
        if (parsed.text !== undefined) {
          callbacks.onText(parsed.text as string);
        }
        if (parsed.saved !== undefined) {
          callbacks.onSaved(parsed.saved as SSESavedPayload);
        }
        if (parsed.error !== undefined) {
          callbacks.onError({
            message: parsed.error as string,
            stage: (parsed.stage as string) ?? "unknown",
          });
        }
      } catch {
        console.warn("[sse-reader] Unparseable event:", payload);
      }
    }
  }

  return { receivedDone };
}
