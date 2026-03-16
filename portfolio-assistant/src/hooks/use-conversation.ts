"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getConversation,
  getMessagesBefore,
  type MessageMeta,
  type MessageRead,
  type SourceRef,
} from "@/lib/conversations";

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  doc_type?: string | null;
  meta?: MessageMeta | null;
  sources?: SourceRef[] | null;
  streaming?: boolean;
  created_at?: string;
  error?: string | null;
}

function toMessage(m: MessageRead): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    doc_type: m.doc_type,
    meta: m.meta,
    sources: m.sources ?? null,
    created_at: m.created_at,
  };
}

export function useConversation(slug: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(!!slug);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);

  const scrollElRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isPrependRef = useRef(false);
  const isInitialLoadRef = useRef(false);
  const prevVcountRef = useRef(0);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});

  // sentinel item (index 0) + messages
  const vcount = messages.length + (hasOlderMessages ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: vcount,
    getScrollElement: () => scrollElRef.current,
    estimateSize: (i) => {
      if (hasOlderMessages && i === 0) return 44; // sentinel
      const msg = messages[i - (hasOlderMessages ? 1 : 0)];
      if (!msg) return 80;
      // rough estimate based on content length to minimise post-measure jumps
      const chars = msg.content.length;
      if (chars < 80) return 72;
      if (chars < 300) return 120;
      return 200;
    },
    measureElement: (el: Element) => el.getBoundingClientRect().height,
    overscan: 5,
    paddingStart: 32,  // ~pt-8
    paddingEnd: 192,   // ~pb-48
    getItemKey: (i: number) => {
      if (hasOlderMessages && i === 0) return "__sentinel__";
      const msg = messages[i - (hasOlderMessages ? 1 : 0)];
      return msg?.id ?? `tmp-${i}`;
    },
  });

  // Load conversation on slug change
  useEffect(() => {
    if (!slug) {
      setMessages([]);
      setHasOlderMessages(false);
      setOldestCursor(null);
      setConversationSummary(null);
      setIsLoadingConversation(false);
      return;
    }
    setIsLoadingConversation(true);
    isInitialLoadRef.current = true;
    getConversation(slug)
      .then((detail) => {
        const msgs = detail.messages.map(toMessage);
        setMessages(msgs);
        setHasOlderMessages(detail.has_more);
        setOldestCursor(msgs[0]?.created_at ?? null);
        setConversationSummary(detail.summary ?? null);
      })
      .catch(() => {
        setMessages([]);
        setHasOlderMessages(false);
        setOldestCursor(null);
        setConversationSummary(null);
      })
      .finally(() => {
        setIsLoadingConversation(false);
      });
  }, [slug]);

  // Scroll to bottom on new messages (not prepends)
  useEffect(() => {
    if (vcount === 0) {
      prevVcountRef.current = 0;
      return;
    }
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(vcount - 1, { align: "end" }),
      );
    } else if (vcount > prevVcountRef.current && !isPrependRef.current) {
      virtualizer.scrollToIndex(vcount - 1, { behavior: "smooth" });
    }
    prevVcountRef.current = vcount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vcount]);

  // Preserve scroll position after prepend
  useLayoutEffect(() => {
    if (!isPrependRef.current) return;
    isPrependRef.current = false;
    const el = scrollElRef.current;
    if (el) el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
  });

  const loadOlderMessages = useCallback(async () => {
    if (!slug || !hasOlderMessages || isLoadingOlder || !oldestCursor) return;
    setIsLoadingOlder(true);
    prevScrollHeightRef.current = scrollElRef.current?.scrollHeight ?? 0;
    isPrependRef.current = true;
    try {
      const page = await getMessagesBefore(slug, oldestCursor, 20);
      const older = page.messages.map(toMessage);
      setMessages((prev) => [...older, ...prev]);
      setOldestCursor(older[0]?.created_at ?? oldestCursor);
      setHasOlderMessages(page.has_more);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [slug, hasOlderMessages, isLoadingOlder, oldestCursor]);

  // Keep ref in sync so IO callback always has the fresh version
  loadOlderRef.current = loadOlderMessages;

  // Stable sentinel ref — reads loadOlderRef at observation time
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    ioRef.current?.disconnect();
    if (!el) return;
    ioRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadOlderRef.current();
      },
      { threshold: 0.1 },
    );
    ioRef.current.observe(el);
  }, []);

  // ── Message mutation helpers ────────────────────────────────────────────────

  function pushUserAndPlaceholder(userContent: string) {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userContent },
      { role: "assistant", content: "", streaming: true },
    ]);
  }

  function updateStreamingContent(content: string) {
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], content };
      return next;
    });
  }

  function finalizeMessage(fields: {
    content: string;
    doc_type: string | null;
    meta: MessageMeta | null;
    sources?: SourceRef[] | null;
    id?: string;
    created_at?: string;
    error?: string | null;
  }) {
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { role: "assistant", streaming: false, ...fields };
      if (next.length > 50) {
        setHasOlderMessages(true);
        const pruned = next.slice(next.length - 50);
        setOldestCursor(pruned[0]?.created_at ?? null);
        return pruned;
      }
      return next;
    });
  }

  return {
    messages,
    hasOlderMessages,
    isLoadingOlder,
    isLoadingConversation,
    conversationSummary,
    setConversationSummary,
    scrollElRef,
    sentinelRef,
    virtualizer,
    pushUserAndPlaceholder,
    updateStreamingContent,
    finalizeMessage,
  };
}
