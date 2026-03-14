"use client";

import { useState } from "react";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import type { ConversationSummary } from "@/lib/conversations";

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

// ── Sidebar entry ──────────────────────────────────────────────────────────────

function ConvEntry({
  conv,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: () => void;
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
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      }`}
      onClick={() => !editing && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] font-mono text-foreground"
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate text-[12px] font-mono"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
            setDraft(conv.title ?? "New conversation");
          }}
        >
          {conv.title ?? "New conversation"}
        </span>
      )}

      {hovered && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const groups = groupConversations(conversations);

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-bg h-full overflow-hidden">
      {/* New chat button */}
      <div className="p-3 border-b border-border/50">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {conversations.length === 0 && (
          <p className="px-3 py-6 text-[11px] font-mono text-muted-foreground/40 text-center">
            No conversations yet
          </p>
        )}

        {GROUP_ORDER.filter((g) => groups.has(g)).map((group) => (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
              {group}
            </p>
            <div className="space-y-0.5">
              {groups.get(group)!.map((conv) => (
                <ConvEntry
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeId}
                  onSelect={() => onSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onRename={(title) => onRename(conv.id, title)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
