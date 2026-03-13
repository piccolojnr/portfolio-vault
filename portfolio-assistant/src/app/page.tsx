"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages change
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

      const history = messages.map(({ role, content }) => ({ role, content }));
      const nextMessages: Message[] = [
        ...messages,
        { role: "user", content: userMsg },
        { role: "assistant", content: "", streaming: true },
      ];
      setMessages(nextMessages);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, history }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No response body");

        // Read the Server-Sent Events stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") break;

            try {
              const { text } = JSON.parse(payload);
              accumulated += text;
              // Update the streaming message in place
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                  streaming: true,
                };
                return updated;
              });
            } catch {}
          }
        }

        // Mark streaming done
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
            streaming: false,
          };
          return updated;
        });
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
    [input, loading, messages],
  );

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 28px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(20,20,22,0.8)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--accent-dim)",
            border: "1px solid rgba(200,169,110,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--accent)",
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          DR
        </div>

        <div>
          <div
            style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            Portfolio Assistant
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
            RAG-powered · Claude or GPT-4o · knows your vault
          </div>
        </div>

        {/* Status indicator */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: loading ? "var(--accent)" : "#4ade80",
              animation: loading ? "pulse-dot 1s ease-in-out infinite" : "none",
            }}
          />
          {loading ? "thinking" : "ready"}
        </div>
      </header>

      {/* ── Messages ── */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 0 160px",
        }}
      >
        {isEmpty ? (
          // ── Empty state ──
          <div
            style={{
              maxWidth: 680,
              margin: "0 auto",
              padding: "64px 24px 0",
              animation: "fade-up 0.4s ease both",
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Portfolio vault · RAG-powered
              </span>
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                marginBottom: 14,
                color: "var(--text)",
              }}
            >
              What do you need,
              <br />
              Daud?
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--muted)",
                lineHeight: 1.65,
                marginBottom: 48,
                maxWidth: 480,
              }}
            >
              I retrieve only the relevant parts of your vault for each question
              — no context stuffing. Ask me to write, tailor, or prepare
              anything.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "13px 15px",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "rgba(226,221,214,0.65)",
                    fontSize: 13,
                    lineHeight: 1.45,
                    fontFamily: "var(--font-sans)",
                    transition: "all 0.15s",
                    animation: `fade-up 0.4s ease ${i * 0.05}s both`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(200,169,110,0.3)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text)";
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(200,169,110,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "rgba(226,221,214,0.65)";
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--surface)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // ── Conversation ──
          <div
            style={{
              maxWidth: 740,
              margin: "0 auto",
              padding: "36px 24px 0",
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 28,
                  display: "flex",
                  flexDirection: m.role === "user" ? "row-reverse" : "row",
                  gap: 12,
                  alignItems: "flex-start",
                  animation:
                    i === messages.length - 1 || i === messages.length - 2
                      ? "fade-up 0.25s ease both"
                      : "none",
                }}
              >
                {/* Avatar — only for assistant */}
                {m.role === "assistant" && (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: "var(--accent-dim)",
                      border: "1px solid rgba(200,169,110,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--accent)",
                      marginTop: 3,
                    }}
                  >
                    DR
                  </div>
                )}

                <div
                  style={{
                    maxWidth: "80%",
                    background:
                      m.role === "user" ? "var(--user-bg)" : "transparent",
                    border:
                      m.role === "user"
                        ? "1px solid var(--user-border)"
                        : "none",
                    borderRadius: m.role === "user" ? "14px 3px 14px 14px" : 0,
                    padding: m.role === "user" ? "11px 16px" : "4px 0",
                    fontSize: 14,
                    lineHeight: 1.75,
                    color:
                      m.role === "user"
                        ? "rgba(226,221,214,0.9)"
                        : "rgba(226,221,214,0.85)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.content}
                  {/* Blinking cursor while streaming */}
                  {m.streaming && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 2,
                        height: "1em",
                        background: "var(--accent)",
                        marginLeft: 2,
                        verticalAlign: "text-bottom",
                        animation: "blink 0.9s step-end infinite",
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* ── Input bar ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, var(--bg) 65%, transparent)",
          padding: "16px 24px 28px",
        }}
      >
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: "10px 12px",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your portfolio..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text)",
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: "var(--font-sans)",
                resize: "none",
                minHeight: 24,
                maxHeight: 180,
                caretColor: "var(--accent)",
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                flexShrink: 0,
                background:
                  input.trim() && !loading
                    ? "var(--accent)"
                    : "rgba(255,255,255,0.06)",
                border: "none",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                color:
                  input.trim() && !loading
                    ? "#0c0c0e"
                    : "rgba(255,255,255,0.2)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              ↑
            </button>
          </div>

          {/* Footer hint */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.18)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>enter to send · shift+enter for newline</span>
            <span>rag · claude or gpt-4o</span>
          </div>
        </div>
      </div>
    </div>
  );
}
