'use client';

import { ConversationSidebar } from "@/components/conversation-sidebar";
import { useConversations } from "@/components/conversation-context";
import { useRouter } from "next/navigation";

export function AppContent({ children }: { children: React.ReactNode }) {
    const { conversations, activeId, deleteConversation, renameConversation } = useConversations();
    const router = useRouter();

    return (
        <div className="flex-1 flex min-h-0 overflow-hidden">
            <ConversationSidebar
                conversations={conversations}
                activeId={activeId}
                onSelect={(id) => router.push(`/${id}`)}
                onNew={() => router.push("/")}
                onDelete={deleteConversation}
                onRename={renameConversation}
            />
            <main className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</main>
        </div>
    );
}
