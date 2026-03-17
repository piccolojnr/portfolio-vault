"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listDocuments,
  createDocument,
  deleteDocument,
  triggerReindex,
  getReindexStatus,
  type CorpusDocSummary as VaultDocSummary,
  type PaginatedDocs,
  type ReindexStatus,
} from "@/lib/documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const TYPE_COLORS: Record<string, string> = {
  project: "bg-primary/15 text-primary border-primary/20",
  bio: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  skills: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  experience: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  brag: "bg-green-500/10 text-green-400 border-green-500/20",
};

const PRESET_TYPES = ["bio", "skills", "experience", "brag", "project"];

function TypePill({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-muted/40 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${cls}`}>
      {type}
    </span>
  );
}

// ── New Document form ─────────────────────────────────────────────────────────

interface NewDocFormProps {
  onCreated: (slug: string) => void;
  onCancel: () => void;
}

function NewDocForm({ onCreated, onCancel }: NewDocFormProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType] = useState("project");
  const [customType, setCustomType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(toSlug(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalType = type === "_custom" ? customType.trim() : type;
    if (!slug || !title || !finalType) return;
    setSubmitting(true);
    setError(null);
    try {
      const doc = await createDocument({ slug, title, type: finalType });
      onCreated(doc.slug);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border/60 rounded-xl bg-surface/60 p-5 mb-6 space-y-4"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        New Document
      </p>

      <div className="grid grid-cols-2 gap-3">
        {/* Title */}
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">Title</label>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Side Project: Payments"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/40"
            required
          />
        </div>

        {/* Slug */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Slug</label>
          <input
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="auto-generated"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/40"
            required
          />
        </div>

        {/* Type */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors"
            >
              {PRESET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="_custom">custom…</option>
            </select>
            {type === "_custom" && (
              <input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="type name"
                className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/40"
                required
                autoFocus
              />
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

interface DeleteCellProps {
  slug: string;
  onDeleted: () => void;
}

function DeleteCell({ slug, onDeleted }: DeleteCellProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteDocument(slug);
      onDeleted();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-muted-foreground">Delete?</span>
        <button
          onClick={handleConfirm}
          disabled={deleting}
          className="text-[11px] text-destructive hover:underline disabled:opacity-50"
        >
          {deleting ? "…" : "Yes"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 sm:p-1 rounded text-muted-foreground hover:text-destructive transition-all"
      title="Delete"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

// ── Reindex button ────────────────────────────────────────────────────────────

function ReindexButton() {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReindexStatus | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId || status?.status === "success" || status?.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await getReindexStatus(runId);
        setStatus(s);
        if (s.status === "success" || s.status === "failed") {
          setRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runId, status?.status]);

  async function handleClick() {
    setRunning(true);
    setStatus(null);
    try {
      const { run_id } = await triggerReindex();
      setRunId(run_id);
    } catch (e: unknown) {
      setRunning(false);
      setStatus({ run_id: "", status: "failed", chunk_count: null, started_at: "", finished_at: null, error: e instanceof Error ? e.message : "error" });
    }
  }

  const isDone = status?.status === "success";
  const isFailed = status?.status === "failed";

  return (
    <Button
      onClick={handleClick}
      disabled={running}
      variant={isFailed ? "destructive" : "outline"}
      size="sm"
      className={isDone ? "border-green-600/40 text-green-400 hover:bg-green-500/10" : ""}
    >
      {running ? (
        <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isDone ? (
        <span className="mr-1.5">✓</span>
      ) : (
        <svg className="mr-1.5" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round"/>
          <path d="M8 1v4l2-2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {running
        ? "Indexing…"
        : isDone
        ? `Done · ${status!.chunk_count} chunks`
        : isFailed
        ? "Failed"
        : "Re-index"}
    </Button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function VaultPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDocs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  function load(p = page) {
    setData(null);
    listDocuments(p, PAGE_SIZE)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items ?? [];

  const filtered = items.filter((d) => {
    const q = search.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q) || d.type.toLowerCase().includes(q);
  });

  // Group by type
  const groups: Record<string, VaultDocSummary[]> = {};
  for (const doc of filtered) {
    (groups[doc.type] ??= []).push(doc);
  }
  const sortedTypes = Object.keys(groups).sort();

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div>
            <h1 className="text-base font-semibold text-foreground">Vault Documents</h1>
            {data !== null && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {data.total} doc{data.total !== 1 ? "s" : ""}
                {search && ` · ${filtered.length} on this page match`}
              </p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ReindexButton />
            <Button size="sm" onClick={() => setShowNew((v) => !v)}>
              {showNew ? "✕ Cancel" : "+ New"}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, slug, or type…"
            className="w-full bg-surface/60 border border-border rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        {/* New doc form */}
        {showNew && (
          <NewDocForm
            onCreated={(slug) => {
              setShowNew(false);
              router.push(`/documents/${slug}`);
            }}
            onCancel={() => setShowNew(false)}
          />
        )}

        {error && <p className="text-destructive text-sm mb-4">{error}</p>}

        {/* Skeleton */}
        {data === null && !error && (
          <div className="space-y-2 mt-2">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {/* Grouped table */}
        {data !== null && sortedTypes.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-12">
            {search ? "No documents on this page match your search." : "No documents yet."}
          </p>
        )}

        {sortedTypes.map((type) => (
          <div key={type} className="mb-6">
            {/* Type header */}
            <div className="flex items-center gap-2 mb-1.5">
              <TypePill type={type} />
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {groups[type].length}
              </span>
            </div>

            {/* Rows */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              {groups[type].map((doc, i) => (
                <div
                  key={doc.slug}
                  onClick={() => router.push(`/documents/${doc.slug}`)}
                  className={`group flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-surface/80 transition-colors ${
                    i < groups[type].length - 1 ? "border-b border-border/40" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {doc.title || doc.slug}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground/60 mt-0.5 truncate">
                      {doc.slug}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="hidden sm:inline text-[11px] text-muted-foreground/50 font-mono">
                      {formatRelative(doc.updated_at)}
                    </span>
                    <DeleteCell
                      slug={doc.slug}
                      onDeleted={() => {
                        // Remove from current page; if page becomes empty go back one
                        const remaining = items.length - 1;
                        if (remaining === 0 && page > 1) {
                          setPage((p) => p - 1);
                        } else {
                          setData((prev) =>
                            prev
                              ? { ...prev, items: prev.items.filter((d) => d.slug !== doc.slug), total: prev.total - 1 }
                              : null
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* Pagination */}
        {data !== null && data.pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2 pb-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-[12px] font-mono transition-colors ${
                    p === page
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface border border-transparent"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
