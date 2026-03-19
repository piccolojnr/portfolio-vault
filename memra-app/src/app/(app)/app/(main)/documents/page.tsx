"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listDocuments,
  deleteDocument,
  type CorpusDocSummary,
} from "@/lib/documents";
import { reIngestDocument } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useActiveCorpus } from "@/lib/documents";

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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

const TYPE_COLORS: Record<string, string> = {
  project: "bg-primary/15 text-primary border-primary/20",
  bio: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  skills: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  experience: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  brag: "bg-green-500/10 text-green-400 border-green-500/20",
  file: "bg-muted/40 text-muted-foreground/60 border-border/40",
};

function TypePill({ type }: { type: string }) {
  const cls =
    TYPE_COLORS[type] ?? "bg-muted/40 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium whitespace-nowrap ${cls}`}
    >
      {type}
    </span>
  );
}

// ── Status badge for the document list ────────────────────────────────────────

export function StatusBadge({ status, showReady = false }: { status?: string; showReady?: boolean }) {
  if (!status) return null;
  if (status === "ready" && !showReady) return null;
  const styles: Record<string, string> = {
    pending: "bg-muted/50 text-muted-foreground border-border/40",
    processing: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    ready: "bg-green-500/10 text-green-400 border-green-500/20",
  };
  const labels: Record<string, string> = {
    pending: "pending",
    processing: "indexing",
    failed: "failed",
    ready: "ready",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${styles[status] ?? "bg-muted/50 text-muted-foreground border-border/40"
        }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Tab strip ─────────────────────────────────────────────────────────────────

type Tab = "all" | "text" | "file" | "failed";

interface TabDef {
  key: Tab;
  label: string;
  count: number;
}

function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="flex gap-0 border-b border-border/60">
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${active === key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          {label}
          <span
            className={`ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${active === key
                ? "bg-primary/15 text-primary"
                : "bg-muted/30 text-muted-foreground/60"
              }`}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

interface RowProps {
  doc: CorpusDocSummary;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onRefresh: () => void;
  canManage: boolean;
}

function DocRow({ doc, selected, onSelect, onRefresh, canManage }: RowProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReingest, setConfirmReingest] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reingesting, setReingesting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteDocument(doc.slug);
      onRefresh();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleReingest(e: React.MouseEvent) {
    e.stopPropagation();
    setReingesting(true);
    setConfirmReingest(false);
    try {
      await reIngestDocument(doc.id);
      onRefresh();
    } catch {
      /* swallow — status will reflect failure */
    } finally {
      setReingesting(false);
    }
  }

  const isFileDoc = doc.source_type === "file";

  return (
    <tr
      onClick={() => router.push(`/documents/${doc.slug}`)}
      className={`group border-b border-border/30 last:border-0 cursor-pointer transition-colors hover:bg-surface/60 ${selected ? "bg-primary/5" : ""}`}
    >
      {/* Checkbox */}
      <td className="w-10 pl-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="accent-primary"
        />
      </td>

      {/* Title + slug */}
      <td className="px-3 py-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground/40 shrink-0 text-sm">
            {isFileDoc ? "📎" : "✎"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate leading-snug">
              {doc.title || doc.slug}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground/50 truncate mt-0.5">
              {doc.slug}
              {isFileDoc && doc.file_size != null && (
                <span className="ml-2 text-muted-foreground/40">
                  {formatBytes(doc.file_size)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-3 py-3 w-28">
        <TypePill type={doc.type} />
      </td>

      {/* Status */}
      <td className="px-3 py-3 w-28">
        {reingesting ? (
          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
            queuing…
          </span>
        ) : (
          <StatusBadge status={doc.lightrag_status} showReady />
        )}
      </td>

      {/* Updated */}
      <td className="px-3 py-3 w-24 text-[11px] font-mono text-muted-foreground/50 whitespace-nowrap">
        {formatRelative(doc.updated_at)}
      </td>

      {/* Actions */}
      <td className="pr-4 py-3 w-28" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Re-ingest */}
          {canManage && (
            confirmReingest ? (
              <span className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={handleReingest}
                  className="text-primary hover:underline"
                >
                  Yes
                </button>
                <span className="text-muted-foreground/40">/</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmReingest(false);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmReingest(true);
                }}
                title="Reprocess"
                className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round" />
                  <path
                    d="M8 1v4l2-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )
          )}

          {/* Delete */}
          {canManage && (
            confirmDelete ? (
              <span className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-destructive hover:underline disabled:opacity-50"
                >
                  {deleting ? "…" : "Yes"}
                </button>
                <span className="text-muted-foreground/40">/</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                title="Delete"
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkBar({
  count,
  onReingest,
  onDelete,
  onClear,
}: {
  count: number;
  onReingest: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-bg border border-border/80 rounded-xl shadow-xl">
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <div className="w-px h-4 bg-border/60" />
      <Button size="sm" variant="outline" onClick={onReingest}>
        <svg
          className="mr-1.5"
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round" />
          <path d="M8 1v4l2-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Reprocess {count}
      </Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>
        Delete {count}
      </Button>
      <button
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
      >
        Clear
      </button>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-bg border border-border/60 rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm}>
              {confirm}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const NON_TERMINAL = new Set(["pending", "processing"]);

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { org } = useAuth();
  const canManage = org?.role === "admin" || org?.role === "owner";
  const { data: corpusData } = useActiveCorpus(org?.id);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReingestConfirm, setBulkReingestConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const {
    data,
    isLoading: loading,
    error: fetchError,
  } = useQuery({
    queryKey: ["documents", page],
    queryFn: () => listDocuments(page, PAGE_SIZE),
    refetchInterval: (query) => {
      const items =
        (query.state.data as { items: CorpusDocSummary[] } | undefined)
          ?.items ?? [];
      return items.some(
        (d) => d.lightrag_status && NON_TERMINAL.has(d.lightrag_status),
      )
        ? 5000
        : false;
    },
    staleTime: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;
  const error = fetchError
    ? fetchError instanceof Error
      ? fetchError.message
      : String(fetchError)
    : null;

  const bulkReingestMut = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map(reIngestDocument)),
    onSuccess: () => {
      setSelected(new Set());
      setBulkReingestConfirm(false);
      qc.invalidateQueries({ queryKey: ["documents", page] });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (slugs: string[]) =>
      Promise.allSettled(slugs.map(deleteDocument)),
    onSuccess: () => {
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      qc.invalidateQueries({ queryKey: ["documents", page] });
    },
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  const tabFiltered = items.filter((d) => {
    if (tab === "text") return d.source_type === "text";
    if (tab === "file") return d.source_type === "file";
    if (tab === "failed") return d.lightrag_status === "failed";
    return true;
  });

  const typeOptions = Array.from(new Set(items.map((d) => d.type))).sort();

  const filtered = tabFiltered.filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const tabs: TabDef[] = [
    { key: "all", label: "All", count: items.length },
    {
      key: "text",
      label: "Text",
      count: items.filter((d) => d.source_type === "text").length,
    },
    {
      key: "file",
      label: "Files",
      count: items.filter((d) => d.source_type === "file").length,
    },
    {
      key: "failed",
      label: "Failed",
      count: items.filter((d) => d.lightrag_status === "failed").length,
    },
  ];

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((s) => {
        const n = new Set(s);
        filtered.forEach((d) => n.delete(d.id));
        return n;
      });
    } else {
      setSelected((s) => {
        const n = new Set(s);
        filtered.forEach((d) => n.add(d.id));
        return n;
      });
    }
  }

  const selectedItems = items.filter((d) => selected.has(d.id));

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Documents
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading
                ? "Loading…"
                : `${total} document${total !== 1 ? "s" : ""} · ${corpusData?.corpus?.name ?? "Knowledge Base"}`}
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Link href="/documents/ingest">
                <Button variant="outline" size="sm">
                  <svg
                    className="mr-1.5"
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M8 12V4M4 8l4-4 4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M2 14h12" strokeLinecap="round" />
                  </svg>
                  Add
                </Button>
              </Link>
              <Link href="/documents/new">
                <Button size="sm">
                  <svg
                    className="mr-1.5"
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Write
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <TabStrip
          tabs={tabs}
          active={tab}
          onChange={(t) => {
            setTab(t);
            setPage(1);
            setSelected(new Set());
          }}
        />
      </div>

      {/* Filter bar */}
      <div className="shrink-0 px-6 py-3 border-b border-border/40 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
            className="w-full bg-surface/40 border border-border/60 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/30"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors"
        >
          <option value="all">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {search || typeFilter !== "all" ? (
          <button
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setPage(1);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground/50 font-mono">
          {filtered.length !== items.length
            ? `${filtered.length} of ${items.length}`
            : `${items.length}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto pb-20">
        {loading ? (
          <div className="space-y-1 px-6 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-surface/60 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">
              {search || typeFilter !== "all"
                ? "No documents match your filters."
                : tab === "failed"
                  ? "No failed documents."
                  : "No documents yet."}
            </p>
            {tab === "all" && !search && (
              <Link
                href="/documents/ingest"
                className="text-xs text-primary hover:underline mt-2"
              >
                Add your first documents →
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/40">
                <th className="w-10 pl-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="accent-primary"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Title
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-28">
                  Type
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-28">
                  Status
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-24">
                  Updated
                </th>
                <th className="pr-4 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  selected={selected.has(doc.id)}
                  onSelect={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                      v ? n.add(doc.id) : n.delete(doc.id);
                      return n;
                    })
                  }
                  onRefresh={() =>
                    qc.invalidateQueries({ queryKey: ["documents", page] })
                  }
                  canManage={canManage}
                />
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-2 justify-center py-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1);
                setSelected(new Set());
              }}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-mono text-muted-foreground/50">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((p) => p + 1);
                setSelected(new Set());
              }}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {canManage && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onReingest={() => setBulkReingestConfirm(true)}
          onDelete={() => setBulkDeleteConfirm(true)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Bulk confirm dialogs */}
      {bulkReingestConfirm && (
        <ConfirmDialog
          title={`Reprocess ${selected.size} document${selected.size !== 1 ? "s" : ""}?`}
          body="This will rebuild the chunks, embeddings, and knowledge graph for each selected document. Previous index entries will be replaced."
          confirm="Reprocess"
          onConfirm={() =>
            bulkReingestMut.mutate(selectedItems.map((d) => d.id))
          }
          onCancel={() => setBulkReingestConfirm(false)}
        />
      )}
      {bulkDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${selected.size} document${selected.size !== 1 ? "s" : ""}?`}
          body="This will permanently remove the selected documents and their text content. This cannot be undone."
          confirm="Delete"
          onConfirm={() =>
            bulkDeleteMut.mutate(selectedItems.map((d) => d.slug))
          }
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
