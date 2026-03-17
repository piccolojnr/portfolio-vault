"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hashFile,
  checkDuplicates,
  uploadDocument,
  getDocumentStatus,
  reIngestDocument,
} from "@/lib/ingest";

const CORPUS_ID = "portfolio_vault";
const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(["ready", "failed"]);
const SUPPORTED_EXTS = new Set(["md", "txt"]);

function isTerminal(s?: string) {
  return s != null && TERMINAL.has(s);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function guessMimetype(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

function getDirectory(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "hashing" | "checking" | "reviewing" | "uploading" | "processing";

interface IngestFile {
  file: File;
  relativePath: string;
  directory: string;
  hash?: string;
  checkStatus?: "new" | "duplicate" | "unsupported";
  existingTitle?: string;
  checked: boolean;
  uploadStatus: "waiting" | "uploading" | "uploaded" | "error";
  uploadError?: string;
  docId?: string;
  processingStatus?: string;
  processingError?: string;
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full text-left mb-2 group"
      >
        <span className="text-muted-foreground/60 text-[10px] w-3 shrink-0">
          {open ? "▾" : "▸"}
        </span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="ml-1 text-[10px] font-mono text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </button>
      {open && children}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface IngestModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  preloadedDocId?: string;
  preloadedTitle?: string;
}

export function IngestModal({
  open,
  onClose,
  onComplete,
  preloadedDocId,
  preloadedTitle,
}: IngestModalProps) {
  const [phase, setPhase] = useState<Phase>(preloadedDocId ? "processing" : "idle");
  const [files, setFiles] = useState<IngestFile[]>(() =>
    preloadedDocId
      ? [
          {
            file: new File([], preloadedTitle ?? ""),
            relativePath: preloadedTitle ?? "",
            directory: "",
            checked: false,
            uploadStatus: "uploaded",
            docId: preloadedDocId,
            processingStatus: "pending",
          },
        ]
      : []
  );
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [openSections, setOpenSections] = useState({
    ready: true,
    duplicate: true,
    unsupported: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !preloadedDocId) {
      setPhase("idle");
      setFiles([]);
      setHashProgress({ done: 0, total: 0 });
      setOpenSections({ ready: true, duplicate: true, unsupported: true });
    }
  }, [open, preloadedDocId]);

  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }

  // ── File picking / hashing / checking ─────────────────────────────────────

  const handleFiles = useCallback(async (rawFiles: FileList) => {
    const all = Array.from(rawFiles);
    if (all.length === 0) return;

    setPhase("hashing");
    setHashProgress({ done: 0, total: all.length });

    const entries: IngestFile[] = [];
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      const hash = await hashFile(f);
      const rp = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      entries.push({
        file: f,
        relativePath: rp,
        directory: getDirectory(rp),
        hash,
        checked: SUPPORTED_EXTS.has(getExt(f.name)), // pre-check supported files
        uploadStatus: "waiting",
      });
      setHashProgress({ done: i + 1, total: all.length });
    }

    setPhase("checking");
    const results = await checkDuplicates(
      CORPUS_ID,
      entries.map((e) => ({
        filename: e.file.name,
        hash: e.hash!,
        size: e.file.size,
        mimetype: guessMimetype(e.file),
      }))
    );

    const resultMap = new Map(results.map((r) => [r.hash, r]));
    setFiles(
      entries.map((e) => {
        const r = resultMap.get(e.hash!);
        return {
          ...e,
          checkStatus: r?.status,
          existingTitle: r?.existing_title,
          checked: r?.status === "new",
        };
      })
    );
    setPhase("reviewing");
  }, []);

  // ── Upload loop ───────────────────────────────────────────────────────────

  const startUpload = useCallback(async () => {
    setPhase("uploading");
    const toUpload = files.filter((e) => e.checkStatus === "new" && e.checked);

    for (const entry of toUpload) {
      setFiles((prev) =>
        prev.map((e) => (e === entry ? { ...e, uploadStatus: "uploading" } : e))
      );
      try {
        const result = await uploadDocument(entry.file, CORPUS_ID, entry.hash!);
        setFiles((prev) =>
          prev.map((e) =>
            e === entry
              ? { ...e, uploadStatus: "uploaded", docId: result.id, processingStatus: "pending" }
              : e
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((e) =>
            e === entry
              ? { ...e, uploadStatus: "error", uploadError: err instanceof Error ? err.message : String(err) }
              : e
          )
        );
      }
    }

    setPhase("processing");
    onComplete();
  }, [files, onComplete]);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "processing") return;
    const uploaded = files.filter((e) => e.docId);
    if (uploaded.length === 0) return;

    const iv = setInterval(async () => {
      let allDone = true;
      for (const entry of uploaded) {
        if (isTerminal(entry.processingStatus)) continue;
        allDone = false;
        try {
          const { status, error } = await getDocumentStatus(entry.docId!);
          setFiles((prev) =>
            prev.map((e) =>
              e.docId === entry.docId ? { ...e, processingStatus: status, processingError: error } : e
            )
          );
          if (isTerminal(status)) onComplete();
        } catch {
          // keep polling
        }
      }
      if (allDone) clearInterval(iv);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(iv);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────

  const newFiles = files.filter((e) => e.checkStatus === "new");
  const dupFiles = files.filter((e) => e.checkStatus === "duplicate");
  const unsupFiles = files.filter((e) => e.checkStatus === "unsupported");
  const checkedCount = newFiles.filter((e) => e.checked).length;
  const allChecked = newFiles.length > 0 && newFiles.every((e) => e.checked);
  const uploadedFiles = files.filter((e) => e.docId);
  const allTerminal = uploadedFiles.length > 0 && uploadedFiles.every((e) => isTerminal(e.processingStatus));
  const isDirMode = files.some((f) => f.relativePath.includes("/"));

  // Directory summary line
  const dirSummary: string = (() => {
    if (!isDirMode || files.length === 0) return "";
    const dirs = new Set(files.map((f) => f.directory).filter(Boolean));
    const extCounts = new Map<string, number>();
    for (const f of files) {
      const ext = getExt(f.file.name);
      extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
    }
    const parts: string[] = [];
    if (dirs.size > 0) parts.push(`Scanned ${dirs.size} folder${dirs.size !== 1 ? "s" : ""}`);
    for (const ext of ["md", "txt"]) {
      const n = extCounts.get(ext) ?? 0;
      if (n > 0) parts.push(`${n} .${ext}`);
    }
    for (const [ext, n] of extCounts) {
      if (!SUPPORTED_EXTS.has(ext)) parts.push(`${n} .${ext} (unsupported)`);
    }
    return parts.join(" · ");
  })();

  // Group ready files by directory
  const readyByDir = new Map<string, IngestFile[]>();
  for (const f of newFiles) {
    const dir = f.directory || "";
    readyByDir.set(dir, [...(readyByDir.get(dir) ?? []), f]);
  }

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden inputs — no accept filter so unsupported types are visible in preview */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={phase === "idle" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-bg border border-border/60 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Ingest Files</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* ── Idle ── */}
            {phase === "idle" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Upload <code className="font-mono text-[11px]">.md</code> or{" "}
                  <code className="font-mono text-[11px]">.txt</code> files. Other
                  types will be shown as unsupported in the preview.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-5 border border-border/60 rounded-xl hover:bg-surface/60 transition-colors text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-2xl">📄</span>
                    Pick files
                  </button>
                  <button
                    type="button"
                    onClick={() => dirInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 p-5 border border-border/60 rounded-xl hover:bg-surface/60 transition-colors text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-2xl">📁</span>
                    Pick folder
                  </button>
                </div>
              </div>
            )}

            {/* ── Hashing / checking ── */}
            {(phase === "hashing" || phase === "checking") && (
              <div className="flex flex-col items-center gap-3 py-8">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  {phase === "hashing"
                    ? `Hashing ${hashProgress.done} / ${hashProgress.total}…`
                    : "Checking for duplicates…"}
                </p>
              </div>
            )}

            {/* ── Reviewing ── */}
            {phase === "reviewing" && (
              <div className="space-y-4">
                {/* Directory summary */}
                {isDirMode && dirSummary && (
                  <p className="text-[11px] text-muted-foreground/70 font-mono bg-muted/20 rounded-lg px-3 py-2">
                    {dirSummary}
                  </p>
                )}

                {/* Ready section */}
                <Section
                  title="Ready to ingest"
                  count={newFiles.length}
                  open={openSections.ready}
                  onToggle={() => toggleSection("ready")}
                >
                  {newFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 px-4 py-2">None</p>
                  ) : (
                    <>
                      {/* Select all / deselect all */}
                      <div className="flex justify-end mb-1">
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((e) =>
                                e.checkStatus === "new" ? { ...e, checked: !allChecked } : e
                              )
                            )
                          }
                        >
                          {allChecked ? "Deselect all" : "Select all"}
                        </button>
                      </div>

                      {/* Groups (by directory in dir mode, flat otherwise) */}
                      <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40">
                        {Array.from(readyByDir.entries()).map(([dir, group]) => (
                          <div key={dir || "__root__"}>
                            {isDirMode && dir && (
                              <div className="px-3 py-1 bg-muted/20 text-[10px] font-mono text-muted-foreground/60">
                                📁 {dir}
                              </div>
                            )}
                            {group.map((e) => (
                              <label
                                key={e.hash}
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface/60 transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={e.checked}
                                  onChange={() =>
                                    setFiles((prev) =>
                                      prev.map((f) => (f === e ? { ...f, checked: !f.checked } : f))
                                    )
                                  }
                                  className="accent-primary shrink-0"
                                />
                                <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                                  {e.file.name}
                                </span>
                                <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">
                                  {formatBytes(e.file.size)}
                                </span>
                                <span className="shrink-0 text-[10px] font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                                  new
                                </span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Section>

                {/* Duplicates */}
                {dupFiles.length > 0 && (
                  <Section
                    title="Skipped — already in corpus"
                    count={dupFiles.length}
                    open={openSections.duplicate}
                    onToggle={() => toggleSection("duplicate")}
                  >
                    <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                      {dupFiles.map((e) => (
                        <div
                          key={e.hash}
                          className="px-3 py-2.5 opacity-60"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                              {e.file.name}
                            </span>
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">
                              {formatBytes(e.file.size)}
                            </span>
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                              duplicate
                            </span>
                          </div>
                          {e.existingTitle && (
                            <p className="text-[11px] text-muted-foreground/60 mt-0.5 pl-0.5">
                              duplicate of &ldquo;{e.existingTitle}&rdquo;
                              {" · "}
                              <span className="italic">
                                Already ingested. Re-ingest from the vault if you want to update it.
                              </span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Unsupported */}
                {unsupFiles.length > 0 && (
                  <Section
                    title="Not yet supported"
                    count={unsupFiles.length}
                    open={openSections.unsupported}
                    onToggle={() => toggleSection("unsupported")}
                  >
                    <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                      {unsupFiles.map((e) => (
                        <div key={e.hash} className="px-3 py-2.5 opacity-60">
                          <div className="flex items-center gap-3">
                            <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                              {e.file.name}
                            </span>
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">
                              {formatBytes(e.file.size)}
                            </span>
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                              unsupported
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 pl-0.5">
                            {getExt(e.file.name) === "pdf"
                              ? "PDF support coming soon"
                              : ["png", "jpg", "jpeg", "gif", "webp"].includes(getExt(e.file.name))
                              ? "Image support coming soon"
                              : "File type not yet supported"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}

            {/* ── Uploading ── */}
            {phase === "uploading" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Uploading…
                </p>
                {files
                  .filter((e) => e.checkStatus === "new" && e.checked)
                  .map((e) => (
                    <div
                      key={e.hash}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{e.file.name}</div>
                        {e.uploadStatus === "uploading" && (
                          <div className="mt-1.5 h-1 rounded-full bg-muted/30 overflow-hidden">
                            <div className="h-full w-1/2 bg-primary/70 rounded-full animate-pulse" />
                          </div>
                        )}
                        {e.uploadStatus === "uploaded" && (
                          <div className="mt-1.5 h-1 rounded-full bg-green-500/40 overflow-hidden">
                            <div className="h-full w-full bg-green-500/70 rounded-full" />
                          </div>
                        )}
                        {e.uploadStatus === "waiting" && (
                          <div className="mt-1.5 h-1 rounded-full bg-muted/20 overflow-hidden" />
                        )}
                        {e.uploadStatus === "error" && (
                          <p className="text-[11px] text-destructive mt-0.5 truncate">{e.uploadError}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-mono ${
                          e.uploadStatus === "uploaded"
                            ? "text-green-400"
                            : e.uploadStatus === "error"
                            ? "text-destructive"
                            : e.uploadStatus === "uploading"
                            ? "text-primary"
                            : "text-muted-foreground/40"
                        }`}
                      >
                        {e.uploadStatus === "uploaded"
                          ? "uploaded"
                          : e.uploadStatus === "error"
                          ? "error"
                          : e.uploadStatus === "uploading"
                          ? "uploading…"
                          : "waiting"}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* ── Processing ── */}
            {phase === "processing" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Building knowledge graph…
                </p>
                {uploadedFiles.map((e) => (
                  <div
                    key={e.docId}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {e.file.name || e.relativePath}
                      </div>
                      {e.processingError && (
                        <p
                          className="text-[11px] text-destructive/80 truncate mt-0.5"
                          title={e.processingError}
                        >
                          {e.processingError}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {(!e.processingStatus || e.processingStatus === "pending") && (
                        <span className="text-[11px] text-muted-foreground font-mono">○ Queued</span>
                      )}
                      {e.processingStatus === "processing" && (
                        <span className="text-[11px] text-yellow-400 font-mono flex items-center gap-1.5">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-yellow-400 border-t-transparent" />
                          Processing — Building knowledge graph…
                        </span>
                      )}
                      {e.processingStatus === "ready" && (
                        <span className="text-[11px] text-green-400 font-mono">✓ Ready</span>
                      )}
                      {e.processingStatus === "failed" && (
                        <>
                          <span
                            className="text-[11px] text-destructive font-mono cursor-help"
                            title={e.processingError ?? "Unknown error"}
                          >
                            ✗ Failed
                          </span>
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline"
                            onClick={async () => {
                              await reIngestDocument(e.docId!);
                              setFiles((prev) =>
                                prev.map((f) =>
                                  f.docId === e.docId
                                    ? { ...f, processingStatus: "pending", processingError: undefined }
                                    : f
                                )
                              );
                            }}
                          >
                            Retry
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-3 border-t border-border/40 shrink-0 flex justify-between items-center gap-2">
            {phase === "reviewing" && (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" disabled={checkedCount === 0} onClick={startUpload}>
                  {checkedCount === 0
                    ? "Nothing to ingest"
                    : `Ingest ${checkedCount} file${checkedCount !== 1 ? "s" : ""}`}
                </Button>
              </>
            )}
            {phase === "processing" && (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
                <Button size="sm" disabled={!allTerminal} onClick={onClose}>
                  Done
                </Button>
              </>
            )}
            {(phase === "idle" ||
              phase === "hashing" ||
              phase === "checking" ||
              phase === "uploading") && (
              <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
                {phase === "idle" ? "Cancel" : "Close"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Status badge for the document list ────────────────────────────────────────

export function StatusBadge({ status, showReady = false }: { status?: string; showReady?: boolean }) {
  if (!status) return null;
  if (status === "ready" && !showReady) return null;
  const styles: Record<string, string> = {
    pending:    "bg-muted/50 text-muted-foreground border-border/40",
    processing: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    failed:     "bg-destructive/10 text-destructive border-destructive/20",
    ready:      "bg-green-500/10 text-green-400 border-green-500/20",
  };
  const labels: Record<string, string> = {
    pending:    "pending",
    processing: "indexing",
    failed:     "failed",
    ready:      "ready",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${
        styles[status] ?? "bg-muted/50 text-muted-foreground border-border/40"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
