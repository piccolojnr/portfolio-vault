"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDocument, updateDocument, type CorpusDocDetail } from "@/lib/documents";
import { getDocumentStatus, reIngestDocument } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import {
  deriveRestrictionState,
  fetchBillingSnapshot,
} from "@/lib/billing/restrictions";

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL = new Set(["ready", "failed"]);
const POLL_MS = 3000;

const TYPE_COLORS: Record<string, string> = {
  project: "bg-primary/15 text-primary border-primary/20",
  bio: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  skills: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  experience: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  brag: "bg-green-500/10 text-green-400 border-green-500/20",
  file: "bg-muted/40 text-muted-foreground/60 border-border/40",
};

const STATUS_CFG: Record<string, { label: string; dot: string; card: string }> = {
  ready: { label: "Ready", dot: "bg-green-400", card: "border-green-500/20 bg-green-500/5" },
  processing: { label: "Processing", dot: "bg-yellow-400 animate-pulse", card: "border-yellow-500/20 bg-yellow-500/5" },
  pending: { label: "Pending", dot: "bg-muted-foreground/40", card: "border-border/40 bg-surface/40" },
  failed: { label: "Failed", dot: "bg-destructive", card: "border-destructive/20 bg-destructive/5" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

// ── Inline title ──────────────────────────────────────────────────────────────

function InlineTitle({
  value,
  onSave,
  canEdit,
}: {
  value: string;
  onSave: (v: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (local.trim() && local !== value) onSave(local.trim());
    else setLocal(value);
  }

  return (
    <div className="flex items-center gap-2 group min-w-0">
      {editing ? (
        <input
          ref={inputRef}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocal(value); setEditing(false); } }}
          className="text-2xl font-semibold tracking-tight bg-transparent border-b border-primary/40 focus:outline-none min-w-0 flex-1"
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight truncate min-w-0 flex-1">
          {value || <span className="text-muted-foreground/40 italic">Untitled</span>}
        </h1>
      )}
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/50 hover:text-foreground transition-all"
          title="Edit title"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Metadata grid ─────────────────────────────────────────────────────────────

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}


// ── Ingestion status panel ────────────────────────────────────────────────────

function IngestionPanel({
  docId,
  initialStatus,
  canManage,
  mutationBlocked,
}: {
  docId: string;
  initialStatus?: string;
  canManage: boolean;
  mutationBlocked: boolean;
}) {
  const [status, setStatus] = useState(initialStatus ?? "pending");
  const [error, setError] = useState<string | undefined>();
  const [reingesting, setReingesting] = useState(false);

  // Poll when non-terminal
  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const iv = setInterval(async () => {
      try {
        const res = await getDocumentStatus(docId);
        setStatus(res.status);
        setError(res.error);
        if (TERMINAL.has(res.status)) clearInterval(iv);
      } catch { /* keep polling */ }
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [docId, status]);

  async function handleReingest() {
    if (mutationBlocked) return;
    setReingesting(true);
    try {
      await reIngestDocument(docId);
      setStatus("pending");
      setError(undefined);
    } finally {
      setReingesting(false);
    }
  }

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;

  return (
    <div className={`rounded-xl border p-5 ${cfg.card}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Knowledge Graph Status
      </p>

      <div className="flex items-center gap-3 mb-4">
        <span className={`w-3 h-3 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-base font-medium text-foreground">{cfg.label}</span>
        {!TERMINAL.has(status) && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground/40" />
        )}
      </div>

      {status === "processing" && (
        <p className="text-sm text-muted-foreground mb-4">
          Building knowledge graph — this may take a minute…
        </p>
      )}

      {status === "failed" && error && (
        <div className="mb-4 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs font-mono text-destructive wrap-break-word">{error}</p>
        </div>
      )}

      {canManage && (
        <Button
          size="sm"
          variant="outline"
          disabled={mutationBlocked || reingesting || status === "processing"}
          onClick={handleReingest}
        >
          {reingesting ? (
            <>
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Queuing…
            </>
          ) : (
            <>
              <svg className="mr-1.5" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round" />
                <path d="M8 1v4l2-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Re-ingest
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// ── Content preview ───────────────────────────────────────────────────────────

function ContentPreview({
  doc,
  canManage,
  mutationBlocked,
}: {
  doc: CorpusDocDetail;
  canManage: boolean;
  mutationBlocked: boolean;
}) {
  const [open, setOpen] = useState(doc.source_type === "text");
  const preview = doc.extracted_text?.slice(0, 500) ?? "";
  const hasContent = !!doc.extracted_text;

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface/40 transition-colors"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Content Preview
        </span>
        <span className="text-muted-foreground/50 text-[10px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-border/40 px-5 py-4">
          {hasContent ? (
            <>
              <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap wrap-break-word leading-relaxed max-h-48 overflow-y-auto">
                {preview}
                {doc.extracted_text.length > 500 && (
                  <span className="text-muted-foreground/40">…</span>
                )}
              </pre>
              {doc.extracted_text.length > 500 && (
                <p className="text-[11px] text-muted-foreground/50 mt-2">
                  Showing first 500 of {doc.extracted_text.length.toLocaleString()} characters
                </p>
              )}
              {canManage && !mutationBlocked && (
                <div className="mt-4">
                  <Link
                    href={`/documents/${doc.slug}/edit`}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    View / edit full content
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 3h7v7M13 3L3 13" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">
              {doc.source_type === "file"
                ? "Content will be available after ingestion completes."
                : "No content yet. "}
              {doc.source_type === "text" && canManage && !mutationBlocked && (
                <Link href={`/documents/${doc.slug}/edit`} className="text-primary hover:underline not-italic">
                  Open editor →
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { org } = useAuth();
  const canManage = org?.role === "admin" || org?.role === "owner";
  const { data: billingData } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBillingSnapshot,
    staleTime: 30_000,
  });
  const restrictions = deriveRestrictionState(billingData);
  const canEdit = canManage && !restrictions.blockDocumentEdit;
  const canReingest = canManage && !restrictions.blockReingest;

  const [doc, setDoc] = useState<CorpusDocDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getDocument(slug)
      .then(setDoc)
      .catch((e: Error) => setLoadError(e.message));
  }, [slug]);

  const save = useCallback(
    async (patch: Parameters<typeof updateDocument>[1]) => {
      if (!doc) return;
      setSaveError(null);
      try {
        const updated = await updateDocument(slug, patch);
        setDoc(updated);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    },
    [doc, slug]
  );

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">{loadError}</p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/documents")}>← Documents</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-5 border-b border-border/40">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Documents
        </Link>

        {doc ? (
          <div className="space-y-2">
            <InlineTitle value={doc.title} onSave={(v) => save({ title: v })} canEdit={canEdit} />
            <div className="flex items-center gap-2 flex-wrap">
              {/* Type pill */}
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${TYPE_COLORS[doc.type] ?? "bg-muted/40 text-muted-foreground border-border"}`}>
                {doc.type}
              </span>
              {/* Source badge */}
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono">
                {doc.source_type === "file" ? "📎 file" : "✎ text"}
              </span>
              {/* Edit link */}
              {canEdit && (
                <Link
                  href={`/documents/${slug}/edit`}
                  className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Edit content
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 3h7v7M13 3L3 13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-8 w-72 rounded bg-surface animate-pulse" />
            <div className="h-4 w-32 rounded bg-surface animate-pulse" />
          </div>
        )}

        {saveError && (
          <p className="text-xs text-destructive mt-2">{saveError}</p>
        )}
        {(restrictions.blockDocumentEdit ||
          restrictions.blockReingest ||
          restrictions.blockReadonlyViews) && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-amber-200">
                {restrictions.reason ??
                  "Your plan currently restricts document access in this workspace."}
              </p>
              <Link
                href={restrictions.upgradeUrl}
                className="shrink-0 text-primary hover:underline"
              >
                Upgrade
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {restrictions.blockReadonlyViews ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
            <p className="text-sm font-medium text-foreground">
              Document details are unavailable for this subscription state.
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              {restrictions.reason ??
                "Please update your plan or billing status to continue."}
            </p>
            <Link
              href={restrictions.upgradeUrl}
              className="mt-3 inline-flex text-primary hover:underline"
            >
              Go to billing →
            </Link>
          </section>
        ) : doc ? (
          <>
            {/* Metadata grid */}
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Metadata</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
                <MetaRow label="Slug">
                  <code className="font-mono text-[13px] text-muted-foreground">{doc.slug}</code>
                </MetaRow>

                <MetaRow label="Type">
                  <code className="font-mono text-[13px] text-muted-foreground">{doc.type}</code>
                </MetaRow>

                <MetaRow label="Source">
                  <span className="text-muted-foreground">
                    {doc.source_type === "file" ? "Uploaded file" : "Text (manually authored)"}
                  </span>
                </MetaRow>

                <MetaRow label="Corpus">
                  <code className="font-mono text-[13px] text-muted-foreground">default</code>
                </MetaRow>

                {doc.source_type === "file" && (
                  <>
                    <MetaRow label="Mimetype">
                      <code className="font-mono text-[13px] text-muted-foreground">{doc.mimetype ?? "—"}</code>
                    </MetaRow>
                    <MetaRow label="File size">
                      <span className="text-muted-foreground">
                        {doc.file_size != null ? formatBytes(doc.file_size) : "—"}
                      </span>
                    </MetaRow>
                  </>
                )}

                <MetaRow label="Created">
                  <span className="text-muted-foreground">{formatAbsolute(doc.created_at)}</span>
                </MetaRow>

                <MetaRow label="Last updated">
                  <span className="text-muted-foreground">{formatAbsolute(doc.updated_at)}</span>
                </MetaRow>
              </dl>
            </section>

            {/* Ingestion status */}
            <IngestionPanel
              docId={doc.id}
              initialStatus={doc.lightrag_status}
              canManage={canManage}
              mutationBlocked={!canReingest}
            />

            {/* Content preview */}
            <ContentPreview doc={doc} canManage={canManage} mutationBlocked={!canEdit} />
          </>
        ) : (
          <div className="space-y-4">
            <div className="h-40 rounded-xl bg-surface animate-pulse" />
            <div className="h-32 rounded-xl bg-surface animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
