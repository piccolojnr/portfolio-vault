"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { type SourceRef } from "@/lib/conversations";
import { getDocument } from "@/lib/documents";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

interface Props {
  source: SourceRef | null;
  onClose: () => void;
}

export function SourceSlideOver({ source, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source) {
      setContent(null);
      return;
    }
    setLoading(true);
    getDocument(source.slug)
      .then((doc) => setContent(doc.extracted_text))
      .catch(() => setContent("Failed to load document."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.slug]);

  return (
    <Sheet
      open={!!source}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 w-[92vw] sm:w-100 lg:w-115 max-w-none!"
      >
        <SheetHeader className="px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-2 pr-8">
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {source?.doc_type}
            </Badge>
            <SheetTitle className="text-sm font-medium truncate leading-snug">
              {source?.title}
            </SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            Source document preview
          </SheetDescription>
          {source && (
            <Link
              href={`/graph?corpus=default&search=${encodeURIComponent(source.title)}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit mt-0.5"
            >
              <ExternalLink className="h-3 w-3" />
              View in graph
            </Link>
          )}
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {loading && (
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[75%]" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-4 w-[80%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
          )}
          {!loading && content && <MarkdownMessage content={content} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
