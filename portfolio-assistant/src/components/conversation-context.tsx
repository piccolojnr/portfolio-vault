"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { 
  listConversations, 
  deleteConversation as apiDeleteConversation,
  patchConversation as apiPatchConversation,
  type ConversationSummary 
} from "@/lib/conversations";
import { useRouter, useParams } from "next/navigation";

interface ConversationContextType {
  conversations: ConversationSummary[];
  activeId: string | null;
  refreshConversations: () => Promise<void>;
  createLocalConversation: (conv: ConversationSummary) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const router = useRouter();
  const params = useParams();
  const activeId = params?.slug as string | null;

  const refreshConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  }, []);

  const createLocalConversation = useCallback((conv: ConversationSummary) => {
    setConversations(prev => [conv, ...prev]);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await apiDeleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      router.push("/");
    }
  }, [activeId, router]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const updated = await apiPatchConversation(id, title);
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, title: updated.title } : c))
    );
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        activeId,
        refreshConversations,
        createLocalConversation,
        deleteConversation,
        renameConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error("useConversations must be used within a ConversationProvider");
  }
  return context;
}
