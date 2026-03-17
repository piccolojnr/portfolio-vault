"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { DocumentMessage } from "@/components/document-message";
import { ConversationMemoryPanel } from "@/components/conversation-memory-panel";
import { createConversation, CONV_QUERY_KEY, type MessageMeta, type SourceRef } from "@/lib/conversations";
import { useConversations } from "./conversation-context";
import { readSSEStream } from "@/lib/sse-reader";
import { type VirtualItem } from "@tanstack/react-virtual";
import { useConversation, type Message } from "@/hooks/use-conversation";

const SUGGESTIONS = [
  "Write a cover letter for a remote Next.js role",
  "Which projects show I can handle payments end-to-end?",
  "Help me prep for an interview about the kiosk project",
  "What are my strongest projects for a backend role?",
  "Draft a LinkedIn summary from my bio",
  "How would I answer: tell me about a hard technical problem you solved?",
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveErrorMessage(stage: string, _raw: string): string {
  if (stage === "llm_start")
    return "Could not reach the AI provider. Check API keys in settings.";
  if (stage === "llm_stream")
    return "The AI response was cut short due to an error.";
  return "Something went wrong. Try again.";
}

function MessageRow({
  message,
  isRecent,
}: {
  message: Message;
  isRecent?: boolean;
}) {
  return (
    <div
      className={`mb-5 sm:mb-6 flex gap-2 sm:gap-3 items-start ${
        message.role === "user" ? "flex-row-reverse" : "flex-row"
      } ${isRecent ? "animate-fade-up" : ""}`}
    >
      {message.role === "assistant" && (
        <Image
          src="/logo.png"
          alt="Assistant"
          width={28}
          height={28}
          className="rounded-full shrink-0 ring-1 ring-primary/20 mt-0.5"
        />
      )}

      {message.role === "user" ? (
        <div className="max-w-[85%] sm:max-w-[80%] text-sm leading-[1.75] whitespace-pre-wrap wrap-break-word bg-user-bg border border-user-border rounded-[16px_4px_16px_16px] px-3.5 sm:px-4 py-2.5 text-foreground/90">
          {message.content}
        </div>
      ) : (
        <div className="flex-1 min-w-0 text-sm text-foreground/85 pt-0.5">
          <DocumentMessage
            content={message.content}
            streaming={message.streaming}
            meta={!message.streaming ? message.meta : null}
            sources={!message.streaming ? (message.sources ?? undefined) : undefined}
          />
          {message.error && !message.streaming && (
            <p className="mt-1.5 text-xs font-mono text-destructive/70">
              {message.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatInterface({ slug }: { slug?: string }) {
  const { createLocalConversation } = useConversations();
  const qc = useQueryClient();

  const {
    messages,
    hasOlderMessages,
    isLoadingOlder,
    isLoadingConversation,
    conversationSummary,
    scrollElRef,
    sentinelRef,
    virtualizer,
    pushUserAndPlaceholder,
    updateStreamingContent,
    finalizeMessage,
  } = useConversation(slug);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  const send = useCallback(
    async (text?: string) => {
      const userMsg = (text ?? input).trim();
      if (!userMsg || loading) return;

      setInput("");
      setLoading(true);
      setFailedMessage(null);

      let messageSources: SourceRef[] = [];

      let currentId = slug;
      if (!currentId) {
        try {
          const conv = await createConversation();
          currentId = conv.id;
          createLocalConversation(conv);
          // Update URL without triggering a Next.js route change (avoids remount)
          window.history.replaceState(null, "", `/${currentId}`);
        } catch (err) {
          console.error("Failed to create conversation", err);
        }
      }

      const history = messages
        .filter((m) => !m.streaming)
        .map(({ role, content }) => ({ role, content }));

      pushUserAndPlaceholder(userMsg);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMsg,
            history,
            conversation_id: currentId ?? undefined,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No response body");

        let accumulated = "";
        let docType: string | null = null;
        let messageMeta: MessageMeta | null = null;
        let savedId: string | undefined;
        let savedCreatedAt: string | undefined;
        let streamError: { message: string; stage: string } | null = null;

        const { receivedDone } = await readSSEStream(
          res.body,
          {
            onText: (text) => {
              accumulated += text;
              updateStreamingContent(accumulated);
            },
            onSaved: (saved) => {
              docType = saved.doc_type ?? null;
              messageMeta = saved.meta ?? null;
              savedId = saved.id;
              savedCreatedAt = saved.created_at;
              // Immediately reflect the new conversation in the sidebar
              void qc.invalidateQueries({ queryKey: CONV_QUERY_KEY });
            },
            onError: (err) => {
              streamError = err;
            },
            onSources: (s) => {
              messageSources = s;
            },
          },
          abortRef.current?.signal,
        );

        if (streamError) {
          const _se = streamError as { stage: string; message: string };
          finalizeMessage({
            content: accumulated,
            doc_type: docType,
            meta: messageMeta,
            sources: messageSources,
            id: savedId,
            created_at: savedCreatedAt,
            error: resolveErrorMessage(_se.stage, _se.message),
          });
          setFailedMessage(userMsg);
        } else if (!receivedDone) {
          finalizeMessage({
            content: accumulated,
            doc_type: docType,
            meta: messageMeta,
            sources: messageSources,
            id: savedId,
            created_at: savedCreatedAt,
            error: "Response interrupted.",
          });
          setFailedMessage(userMsg);
        } else {
          finalizeMessage({
            content: accumulated,
            doc_type: docType,
            meta: messageMeta,
            sources: messageSources,
            id: savedId,
            created_at: savedCreatedAt,
          });
          setFailedMessage(null);
        }

        if (currentId) {
          // Second invalidation catches auto-generated titles which are produced
          // asynchronously on the backend after the stream ends.
          setTimeout(
            () => void qc.invalidateQueries({ queryKey: CONV_QUERY_KEY }),
            2500,
          );
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Request failed";
        finalizeMessage({
          content: "",
          doc_type: null,
          meta: null,
          sources: null,
          error: `Connection error: ${msg}`,
        });
        setFailedMessage(userMsg);
      } finally {
        setLoading(false);
      }
    },
    [
      input,
      loading,
      messages,
      slug,
      qc,
      createLocalConversation,
      pushUserAndPlaceholder,
      updateStreamingContent,
      finalizeMessage,
    ],
  );

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0 && !loading && !isLoadingConversation;

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
      {/* Memory panel — pinned above scroll, only when summary exists */}
      {conversationSummary && (
        <div className="shrink-0 px-3 sm:px-6 pt-2 max-w-170 mx-auto w-full">
          <ConversationMemoryPanel summary={conversationSummary} />
        </div>
      )}

      {/* Message / empty area */}
      <div
        ref={scrollElRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
      >
        {isLoadingConversation ? (
          /* ── Loading skeleton ── */
          <div className="max-w-170 mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
            {[80, 56, 120, 48].map((w, i) => (
              <div
                key={i}
                className={`flex gap-3 items-start ${i % 2 === 0 ? "flex-row-reverse" : "flex-row"}`}
              >
                {i % 2 !== 0 && (
                  <div className="h-7 w-7 rounded-lg shrink-0 bg-muted/40 animate-pulse" />
                )}
                <div
                  className="h-9 rounded-2xl bg-muted/40 animate-pulse"
                  style={{ width: `${w}%` }}
                />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          /* ── Empty state ── */
          <div className="max-w-155 mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-48 animate-fade-up">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[10px] sm:text-[11px] text-primary tracking-widest uppercase">
                Portfolio vault · RAG-powered
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-[1.15] mb-3 text-foreground">
              What do you need,
              <br />
              Daud?
            </h1>

            <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed mb-2 max-w-120">
              I retrieve only the relevant parts of your vault for each question
              — no context stuffing. Ask me to write, tailor, or prepare
              anything.
            </p>

            <Separator className="my-6 sm:my-8 bg-border" />

            {/* Single column on mobile, 2 cols on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, i) => (
                <Button
                  key={i}
                  variant="outline"
                  onClick={() => send(s)}
                  style={{ animationDelay: `${i * 0.05}s` }}
                  className="h-auto px-4 py-3 text-left justify-start text-[13px] leading-snug text-muted-foreground font-normal whitespace-normal bg-surface border-border hover:border-primary/30 hover:text-foreground hover:bg-primary/5 animate-fade-up transition-all min-h-13"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Virtualised message list ── */
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            className="max-w-170 mx-auto px-4 sm:px-6"
          >
            {virtualizer.getVirtualItems().map((vitem: VirtualItem) => {
              const isSentinel = hasOlderMessages && vitem.index === 0;
              const msgIndex = vitem.index - (hasOlderMessages ? 1 : 0);
              const msg = isSentinel ? null : messages[msgIndex];
              const isRecent = !isSentinel && msgIndex >= messages.length - 2;

              return (
                <div
                  key={vitem.key}
                  data-index={vitem.index}
                  ref={isSentinel ? sentinelRef : virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vitem.start}px)`,
                  }}
                >
                  {isSentinel ? (
                    <div className="py-3 flex justify-center text-muted-foreground/40">
                      {isLoadingOlder ? (
                        <span className="text-[11px] font-mono">loading…</span>
                      ) : null}
                    </div>
                  ) : (
                    <MessageRow message={msg!} isRecent={isRecent} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div
          style={{ height: virtualizer.getVirtualItems().length ? 80 : 0 }}
        />
      </div>

      {/* ── Floating input bar ── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10  pt-14 sm:pt-20 px-3 sm:px-6">
        <div
          className="max-w-170 mx-auto pointer-events-auto bg-background rounded-t-2xl"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {failedMessage && !loading && (
            <div className="flex items-center gap-2 px-4 pb-2 text-xs font-mono">
              <span className="text-destructive/70">Response failed.</span>
              <button
                onClick={() => {
                  setFailedMessage(null);
                  send(failedMessage);
                }}
                className="text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          <div
            className="flex gap-2 sm:gap-3 items-end bg-surface border border-border rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/30 transition-all"
            style={{
              alignItems: "anchor-center",
            }}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your portfolio…"
              rows={1}
              // className="flex-1 bg-transparent border-none shadow-none outline-none focus-visible:ring-0 text-foreground text-sm leading-relaxed font-sans resize-none min-h-6 max-h-40 caret-primary placeholder:text-muted-foreground p-0"
              className="flex-1 bg-transparent border-none shadow-none outline-none focus-visible:ring-0 text-foreground text-sm leading-relaxed font-sans resize-none min-h-6 max-h-40 caret-primary placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 rounded-lg transition-all disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex justify-between mt-1.5 px-4 text-[11px] text-muted-foreground/50 font-mono bg-background">
            {/* Keyboard hint — only meaningful on desktop */}
            <span className="hidden sm:block text-center">
              enter to send · shift+enter for newline
            </span>
            <span className="sm:hidden" />

            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
                  loading ? "bg-primary animate-pulse-dot" : "bg-[#4ade80]"
                }`}
              />
              {loading ? "thinking…" : "ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
