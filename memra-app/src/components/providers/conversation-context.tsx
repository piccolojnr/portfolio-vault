"use client";

import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CONV_QUERY_KEY,
  listConversations,
  deleteConversation as apiDeleteConversation,
  patchConversation as apiPatchConversation,
  type ConversationSummary,
} from "@/lib/conversations";

// Re-export so callers that were importing from here keep working.
export { CONV_QUERY_KEY };

interface ConversationContextType {
  conversations: ConversationSummary[];
  /** True only on the very first fetch (no data yet). */
  isLoading: boolean;
  /** True whenever a background refetch is in flight. */
  isFetching: boolean;
  refreshConversations: () => Promise<void>;
  createLocalConversation: (conv: ConversationSummary) => void;
  /** Deletes and updates the cache. Navigation on active-delete is the
   *  caller's responsibility — see app-content.tsx. */
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(
  undefined,
);

export function ConversationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const qc = useQueryClient();

  const {
    data: conversations = [],
    isPending: isLoading,
    isFetching,
  } = useQuery({
    queryKey: CONV_QUERY_KEY,
    queryFn: listConversations,
  });

  const refreshConversations = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: CONV_QUERY_KEY });
  }, [qc]);

  // Optimistic prepend — used immediately after creating a conversation so the
  // sidebar shows it before the next background refetch.
  const createLocalConversation = useCallback(
    (conv: ConversationSummary) => {
      qc.setQueryData<ConversationSummary[]>(CONV_QUERY_KEY, (old = []) => [
        conv,
        ...old,
      ]);
    },
    [qc],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const snapshot = qc.getQueryData<ConversationSummary[]>(CONV_QUERY_KEY);
      qc.setQueryData<ConversationSummary[]>(CONV_QUERY_KEY, (old = []) =>
        old.filter((c) => c.id !== id),
      );
      try {
        await apiDeleteConversation(id);
      } catch {
        if (snapshot) qc.setQueryData(CONV_QUERY_KEY, snapshot);
        toast.error("Failed to delete conversation");
      }
    },
    [qc],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const snapshot = qc.getQueryData<ConversationSummary[]>(CONV_QUERY_KEY);
      // Optimistic update
      qc.setQueryData<ConversationSummary[]>(CONV_QUERY_KEY, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, title } : c)),
      );
      try {
        const updated = await apiPatchConversation(id, title);
        // Settle with the server value
        qc.setQueryData<ConversationSummary[]>(CONV_QUERY_KEY, (old = []) =>
          old.map((c) => (c.id === id ? updated : c)),
        );
      } catch {
        if (snapshot) qc.setQueryData(CONV_QUERY_KEY, snapshot);
        toast.error("Failed to rename conversation");
      }
    },
    [qc],
  );

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        isLoading,
        isFetching,
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
    throw new Error(
      "useConversations must be used within a ConversationProvider",
    );
  }
  return context;
}
