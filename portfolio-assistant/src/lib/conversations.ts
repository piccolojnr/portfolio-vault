/**
 * lib/conversations.ts
 * ====================
 * Typed API client for conversation endpoints.
 */

export interface MessageMeta {
  intent: "conversational" | "retrieval" | "document" | "refinement";
  rag_retrieved: boolean;
  chunks_count: number;
}

export interface MessageRead {
  id: string;
  role: "user" | "assistant";
  content: string;
  doc_type: string | null;
  meta: MessageMeta | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  summary: string | null;
  summarised_up_to_message_id: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageRead[];
  has_more: boolean;
}

export interface MessagesPage {
  messages: MessageRead[];
  has_more: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch("/api/conversations");
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return apiFetch(`/api/conversations/${id}`);
}

export function createConversation(): Promise<ConversationSummary> {
  return apiFetch("/api/conversations", { method: "POST" });
}

export function patchConversation(
  id: string,
  title: string,
): Promise<ConversationSummary> {
  return apiFetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string): Promise<void> {
  return fetch(`/api/conversations/${id}`, { method: "DELETE" }).then(
    () => undefined,
  );
}

export function updateConversationSummary(
  convId: string,
  summary: string,
  summarisedUpToMessageId: string,
): Promise<void> {
  return fetch(`/api/conversations/${convId}/summary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      summarised_up_to_message_id: summarisedUpToMessageId,
    }),
  }).then(() => undefined);
}

export function getMessagesBefore(
  id: string,
  cursor: string,
  limit = 20,
): Promise<MessagesPage> {
  const qs = new URLSearchParams({ cursor, limit: String(limit) });
  return apiFetch(`/api/conversations/${id}/messages?${qs}`);
}

export function addMessage(
  convId: string,
  role: "user" | "assistant",
  content: string,
  docType?: string | null,
  meta?: MessageMeta | null,
): Promise<MessageRead> {
  return apiFetch(`/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, doc_type: docType ?? null, meta: meta ?? null }),
  });
}
