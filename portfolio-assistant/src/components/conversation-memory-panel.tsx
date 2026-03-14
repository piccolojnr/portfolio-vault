"use client";

import { useState } from "react";
import { BookOpen, X } from "lucide-react";

interface Props {
  summary: string;
}

export function ConversationMemoryPanel({ summary }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative flex justify-end mb-2">
      {/* Icon trigger */}
      <button
        onClick={() => setExpanded((v) => !v)}
        title="Conversation memory"
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors font-mono text-[10px] tracking-wide
          ${expanded
            ? "bg-muted/40 text-muted-foreground/70"
            : "text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/20"
          }`}
      >
        <BookOpen className="h-3 w-3 shrink-0" />
        <span className="uppercase">memory</span>
      </button>

      {/* Dropdown panel */}
      {expanded && (
        <div className="absolute top-full right-0 mt-1 z-20 w-80 rounded-lg border border-border/40 bg-surface/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <span className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wide">
              What I remember
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="px-3 py-3 max-h-48 overflow-y-auto">
            <p className="font-mono text-[11px] text-muted-foreground/60 whitespace-pre-wrap leading-relaxed">
              {summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
