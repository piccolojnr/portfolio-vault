"use client";

import { useState } from "react";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { ConversationSummary } from "@/lib/conversations";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// ── Date grouping ──────────────────────────────────────────────────────────────

type Group = "Today" | "Yesterday" | "This week" | "Older";

function groupLabel(dateStr: string): Group {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1 && now.getDate() === d.getDate()) return "Today";
  if (diffDays < 2 && now.getDate() - d.getDate() === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Older";
}

const GROUP_ORDER: Group[] = ["Today", "Yesterday", "This week", "Older"];

function groupConversations(
  convs: ConversationSummary[],
): Map<Group, ConversationSummary[]> {
  const map = new Map<Group, ConversationSummary[]>();
  for (const conv of convs) {
    const g = groupLabel(conv.updated_at);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(conv);
  }
  return map;
}

// ── Conversation entry ─────────────────────────────────────────────────────────

function ConvEntry({
  conv,
  active,
  onDelete,
  onRename,
}: {
  conv: ConversationSummary;
  active: boolean;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title ?? "");
  const [hovered, setHovered] = useState(false);

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conv.title) onRename(trimmed);
    else setDraft(conv.title ?? "");
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        render={editing ? <div /> : <Link href={`/${conv.id}`} />}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="pr-7"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(conv.title ?? "");
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] font-mono"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[12px] font-mono"
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
              setDraft(conv.title ?? "New conversation");
            }}
          >
            {conv.title ?? "New conversation"}
          </span>
        )}
      </SidebarMenuButton>

      {hovered && !editing && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-sidebar-foreground/30 hover:text-destructive transition-colors z-10"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </SidebarMenuItem>
  );
}

// ── Sidebar content ────────────────────────────────────────────────────────────

export function ConversationSidebarContent({
  conversations,
  activeId,
  onDelete,
  onRename,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const groups = groupConversations(conversations);

  return (
    <>
      <SidebarHeader className="px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />}>
              <Plus className="h-3.5 w-3.5" />
              <span className="font-mono text-[12px]">New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {conversations.length === 0 && (
          <p className="px-4 py-6 text-[11px] font-mono text-sidebar-foreground/30 text-center">
            No conversations yet
          </p>
        )}

        {GROUP_ORDER.filter((g) => groups.has(g)).map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="font-mono text-[10px] tracking-wider uppercase text-sidebar-foreground/40">
              {group}
            </SidebarGroupLabel>
            <SidebarMenu>
              {groups.get(group)!.map((conv) => (
                <ConvEntry
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onDelete={() => onDelete(conv.id)}
                  onRename={(title) => onRename(conv.id, title)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </>
  );
}
