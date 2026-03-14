"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DocumentMessage } from "@/components/document-message";
import {
  getConversation,
  createConversation,
  listConversations,
} from "@/lib/conversations";
import { useConversations } from "./conversation-context";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  doc_type?: string | null;
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Write a cover letter for a remote Next.js role",
  "Which projects show I can handle payments end-to-end?",
  "Help me prep for an interview about the kiosk project",
  "What are my strongest projects for a backend role?",
  "Draft a LinkedIn summary from my bio",
  "How would I answer: tell me about a hard technical problem you solved?",
];

export function ChatInterface({ slug }: { slug?: string }) {
  const { createLocalConversation, refreshConversations } = useConversations();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation if slug is provided
  useEffect(() => {
    if (slug) {
      getConversation(slug)
        .then((detail) => setMessages(detail.messages))
        .catch(() => setMessages([]));
    } else {
      setMessages([]);
    }
  }, [slug]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const send = useCallback(
    async (text?: string) => {
      const userMsg = (text ?? input).trim();
      if (!userMsg || loading) return;

      setInput("");
      setLoading(true);

      let currentId = slug;
      if (!currentId) {
        try {
          const conv = await createConversation();
          currentId = conv.id;
          createLocalConversation(conv);
          // We don't push yet, we'll continue the stream here
        } catch (err) {
          console.error("Failed to create conversation", err);
        }
      }

      const history = messages
        .filter((m) => !m.streaming)
        .map(({ role, content }) => ({ role, content }));

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
        { role: "assistant", content: "", streaming: true },
      ]);

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

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let docType: string | null = null;
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop()!;

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") break;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.text !== undefined) {
                accumulated += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                    streaming: true,
                  };
                  return updated;
                });
              }
              if (parsed.saved !== undefined) {
                docType = parsed.saved.doc_type ?? null;
              }
            } catch {}
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
            doc_type: docType,
            streaming: false,
          };
          return updated;
        });

        // If it was a new conversation, redirect to the new slug
        if (!slug && currentId) {
          router.push(`/${currentId}`);
          // Refresh list to show the new title
          setTimeout(() => refreshConversations(), 1000);
        } else if (currentId) {
             // Just refresh for title updates
             setTimeout(() => refreshConversations(), 2000);
        }

      } catch (err: any) {
        if (err.name === "AbortError") return;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Check the console.",
            streaming: false,
          };
          return updated;
        });
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, slug, createLocalConversation, refreshConversations, router]
  );

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0">
        <div className="h-full w-full">
          {isEmpty ? (
            <div className="h-full overflow-y-auto">
              <div className="max-w-[620px] mx-auto px-6 pt-16 pb-48 animate-fade-up">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-[11px] text-primary tracking-[0.1em] uppercase">
                    Portfolio vault · RAG-powered
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight leading-[1.15] mb-3 text-foreground">
                  What do you need,
                  <br />
                  Daud?
                </h1>
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-2 max-w-[480px]">
                  I retrieve only the relevant parts of your vault for each
                  question — no context stuffing. Ask me to write, tailor, or
                  prepare anything.
                </p>

                <Separator className="my-8 bg-border" />

                <div className="grid grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      onClick={() => send(s)}
                      style={{ animationDelay: `${i * 0.05}s` }}
                      className="h-auto px-4 py-3 text-left justify-start text-[13px] leading-snug text-muted-foreground font-normal whitespace-normal bg-surface border-border hover:border-primary/30 hover:text-foreground hover:bg-primary/5 animate-fade-up transition-all"
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="max-w-[680px] mx-auto px-6 pt-8 pb-48">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`mb-6 flex gap-3 items-start ${
                      m.role === "user" ? "flex-row-reverse" : "flex-row"
                    } ${
                      i >= messages.length - 2 ? "animate-fade-up" : ""
                    }`}
                  >
                    {m.role === "assistant" && (
                      <Avatar className="h-7 w-7 rounded-lg shrink-0 ring-1 ring-primary/20 bg-accent-dim mt-0.5">
                        <AvatarFallback className="rounded-lg bg-accent-dim text-primary text-[10px] font-medium font-mono">
                          DR
                        </AvatarFallback>
                      </Avatar>
                    )}

                    {m.role === "user" ? (
                      <div className="max-w-[80%] text-sm leading-[1.75] whitespace-pre-wrap break-words bg-user-bg border border-user-border rounded-[16px_4px_16px_16px] px-4 py-2.5 text-foreground/90">
                        {m.content}
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 text-sm text-foreground/85 pt-0.5">
                        <DocumentMessage
                          content={m.content}
                          streaming={m.streaming}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-20 px-6 pb-6">
        <div className="max-w-[680px] mx-auto pointer-events-auto">
          <div className="flex gap-3 items-end bg-surface border border-border rounded-2xl px-4 py-3 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/30 transition-all">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your portfolio…"
              rows={1}
              className="flex-1 bg-transparent border-none shadow-none outline-none focus-visible:ring-0 text-foreground text-sm leading-relaxed font-sans resize-none min-h-6 max-h-[180px] caret-primary placeholder:text-muted-foreground p-0"
            />
            <Button
              size="icon"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="h-8 w-8 shrink-0 rounded-lg transition-all disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex justify-between mt-2 text-[11px] text-muted-foreground/50 font-mono">
            <span>enter to send · shift+enter for newline</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
                  loading
                    ? "bg-primary animate-pulse-dot"
                    : "bg-[#4ade80]"
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
