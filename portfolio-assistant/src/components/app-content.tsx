"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { HeaderNav } from "@/components/header-nav";
import { ConversationSidebarContent } from "@/components/conversation-sidebar";
import { useConversations } from "@/components/conversation-context";

export function AppContent({ children }: { children: React.ReactNode }) {
  const { conversations, activeId, deleteConversation, renameConversation } =
    useConversations();

  return (
    <SidebarProvider className="h-svh">
      <Sidebar collapsible="offcanvas">
        <ConversationSidebarContent
          conversations={conversations}
          activeId={activeId}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      </Sidebar>

      <SidebarInset className="overflow-hidden">
        <header className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-bg/90 backdrop-blur-md z-20">
          <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="h-4 shrink-0" />

          <Avatar className="h-7 w-7 rounded-[7px] ring-1 ring-primary/20 bg-accent-dim shrink-0">
            <AvatarFallback className="rounded-[7px] bg-accent-dim text-primary text-[10px] font-semibold font-mono tracking-wide">
              DR
            </AvatarFallback>
          </Avatar>

          {/* Title — hidden on small screens to save space */}
          <div className="hidden sm:flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              Portfolio Assistant
            </span>
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[9px] font-mono border-primary/20 text-primary/60 py-0 shrink-0"
            >
              RAG
            </Badge>
          </div>

          <div className="ml-auto">
            <HeaderNav />
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
