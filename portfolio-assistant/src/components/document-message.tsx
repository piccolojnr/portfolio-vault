"use client";

import { useState } from "react";
import { Copy, FileText, FileDown, Check } from "lucide-react";
import { MarkdownMessage } from "@/components/markdown-message";
import { type MessageMeta, type SourceRef } from "@/lib/conversations";
import { SourceSlideOver } from "@/components/source-slide-over";

const DOC_RE =
  /<document\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]+?)<\/document>/;

interface ParsedDoc {
  docType: string;
  title: string;
  body: string;
}

function parseDocument(content: string): ParsedDoc | null {
  const m = content.match(DOC_RE);
  if (!m) return null;
  return { docType: m[1], title: m[2], body: m[3].trim() };
}

async function downloadBlob(path: string, body: object, filename: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ActionBar({ doc }: { doc: ParsedDoc }) {
  const [copied, setCopied] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(doc.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDocx() {
    setDocxLoading(true);
    setErr(null);
    try {
      await downloadBlob(
        "/api/export/docx",
        { content: doc.body, title: doc.title },
        `${doc.title}.docx`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDocxLoading(false);
    }
  }

  async function handlePdf() {
    setPdfLoading(true);
    setErr(null);
    try {
      await downloadBlob(
        "/api/export/pdf",
        { content: doc.body, title: doc.title },
        `${doc.title}.pdf`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "copied" : "Copy MD"}
      </button>

      <button
        onClick={handleDocx}
        disabled={docxLoading}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
      >
        <FileText className="h-3 w-3" />
        {docxLoading ? "…" : "Download .docx"}
      </button>

      <button
        onClick={handlePdf}
        disabled={pdfLoading}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
      >
        <FileDown className="h-3 w-3" />
        {pdfLoading ? "…" : "Download .pdf"}
      </button>

      {err && (
        <span className="text-[11px] font-mono text-destructive">{err}</span>
      )}
    </div>
  );
}

function MessageMetaBadges({ meta }: { meta: MessageMeta }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="px-1.5 py-0.5 rounded bg-muted/30 font-mono text-[10px] text-muted-foreground/50">
        {meta.intent}
      </span>
      {meta.rag_retrieved && (
        <span className="px-1.5 py-0.5 rounded bg-muted/30 font-mono text-[10px] text-muted-foreground/50">
          • {meta.chunks_count} chunk{meta.chunks_count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Inline ref marker injection ────────────────────────────────────────────────

function injectRefMarkers(content: string): string {
  return content.replace(
    /\[(\d+)\]/g,
    (_, n) => `<span data-ref="${n}" class="inline-ref">[${n}]</span>`,
  );
}

// ── Source chip ────────────────────────────────────────────────────────────────

function SourceChip({
  source,
  active,
  viewed,
  onHover,
  onLeave,
  onClick,
}: {
  source: SourceRef;
  active: boolean;
  viewed: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-all ${
        active
          ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400"
          : "border-border bg-muted/50 hover:border-amber-400/50"
      } ${viewed ? "opacity-60" : ""}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <span className="text-amber-400 font-mono">[{source.ref}]</span>
      <span className="max-w-[24ch] truncate">{source.title}</span>
      <span className="text-muted-foreground font-mono text-[10px]">
        {source.doc_type}
      </span>
    </button>
  );
}

/**
 * DocumentMessage — renders assistant content.
 * If the content contains a <document> wrapper, shows a styled doc panel + action bar.
 * Otherwise falls through to the regular MarkdownMessage.
 */
export function DocumentMessage({
  content,
  streaming,
  meta,
  sources,
}: {
  content: string;
  streaming?: boolean;
  meta?: MessageMeta | null;
  sources?: SourceRef[];
}) {
  const doc = !streaming ? parseDocument(content) : null;

  const [activeRef, setActiveRef] = useState<number | null>(null);
  const [viewedRefs, setViewedRefs] = useState<Set<number>>(new Set());
  const [slideOverSource, setSlideOverSource] = useState<SourceRef | null>(null);

  function addViewed(ref: number) {
    setViewedRefs((prev) => new Set([...prev, ref]));
  }

  // Inject inline ref markers into content for rendering
  const processedContent = !streaming && sources?.length
    ? injectRefMarkers(content)
    : content;

  const processedBody = !streaming && sources?.length && doc
    ? injectRefMarkers(doc.body)
    : doc?.body ?? "";

  // Source chips row (shown when not streaming and sources exist)
  const sourceChips =
    !streaming && sources && sources.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <SourceChip
            key={s.ref}
            source={s}
            active={activeRef === s.ref}
            viewed={viewedRefs.has(s.ref)}
            onHover={() => setActiveRef(s.ref)}
            onLeave={() => setActiveRef(null)}
            onClick={() => {
              addViewed(s.ref);
              setSlideOverSource(s);
            }}
          />
        ))}
      </div>
    ) : null;

  if (doc) {
    return (
      <>
        <div className="rounded-xl border border-border/60 bg-surface/60 overflow-hidden">
          {/* Doc header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
            <FileText className="h-3.5 w-3.5 text-primary/60 shrink-0" />
            <span className="text-[11px] font-mono text-muted-foreground/70 uppercase tracking-wide">
              {doc.docType.replace("_", " ")}
            </span>
            <span className="ml-auto text-[11px] font-mono text-foreground/60 truncate max-w-60">
              {doc.title}
            </span>
          </div>

          {/* Doc body */}
          <div className="px-5 py-4 text-sm text-foreground/85">
            <MarkdownMessage content={processedBody} />
          </div>

          {/* Action bar */}
          <div className="px-4 py-2.5 border-t border-border/40 bg-muted/10">
            <ActionBar doc={doc} />
          </div>

          {!streaming && meta && meta.intent !== "conversational" && (
            <div className="px-4 pb-2.5">
              <MessageMetaBadges meta={meta} />
            </div>
          )}
        </div>

        {sourceChips}
        <SourceSlideOver
          source={slideOverSource}
          onClose={() => setSlideOverSource(null)}
        />
      </>
    );
  }

  return (
    <>
      <MarkdownMessage content={processedContent} />
      {streaming && (
        <span className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 align-text-bottom animate-blink" />
      )}
      {!streaming && meta && meta.intent !== "conversational" && (
        <MessageMetaBadges meta={meta} />
      )}
      {sourceChips}
      <SourceSlideOver
        source={slideOverSource}
        onClose={() => setSlideOverSource(null)}
      />
    </>
  );
}
