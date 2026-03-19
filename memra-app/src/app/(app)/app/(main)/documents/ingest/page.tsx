"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  hashFile,
  checkDuplicates,
  uploadDocument,
  getDocumentStatus,
  reIngestDocument,
} from "@/lib/documents";

const POLL_MS = 3000;
const TERMINAL = new Set(["ready", "failed"]);
const SUPPORTED = new Set(["md", "txt"]);
const DIR_FILE_LIMIT = 500;

function isTerminal(s?: string) {
  return s != null && TERMINAL.has(s);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function guessMimetype(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
function getDir(rp: string) {
  const p = rp.split("/");
  return p.length > 1 ? p.slice(0, -1).join("/") : "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "hashing"
  | "checking"
  | "reviewing"
  | "uploading"
  | "processing";

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

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Select", "Review", "Upload", "Processing"] as const;

function phaseToStep(phase: Phase): number {
  if (phase === "idle") return 0;
  if (phase === "hashing" || phase === "checking" || phase === "reviewing")
    return 1;
  if (phase === "uploading") return 2;
  return 3;
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono border-2 transition-colors ${
                i < current
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : i === current
                    ? "bg-primary border-primary text-white"
                    : "bg-transparent border-border/40 text-muted-foreground/40"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className={`text-[11px] font-mono transition-colors ${i === current ? "text-foreground" : "text-muted-foreground/40"}`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`flex-1 h-px mx-3 mb-4 transition-colors ${i < current ? "bg-primary/30" : "bg-border/30"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title,
  count,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 mb-2 group w-full text-left"
      >
        <span className="text-muted-foreground/50 text-[10px] w-3">
          {open ? "▾" : "▸"}
        </span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] font-mono bg-muted/30 text-muted-foreground/60 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
        {badge && (
          <span className="text-[10px] font-mono text-muted-foreground/40 italic">
            {badge}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── Table wrapper ─────────────────────────────────────────────────────────────

function ReviewTable({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead className="border-b border-border/40 bg-muted/10">
          <tr>{header}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const TH = ({
  children,
  right,
}: {
  children?: React.ReactNode;
  right?: boolean;
}) => (
  <th
    className={`px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider ${right ? "text-right" : "text-left"}`}
  >
    {children}
  </th>
);

const TD = ({
  children,
  right,
  muted,
  mono,
}: {
  children?: React.ReactNode;
  right?: boolean;
  muted?: boolean;
  mono?: boolean;
}) => (
  <td
    className={`px-4 py-2.5 ${right ? "text-right" : ""} ${muted ? "text-muted-foreground/60" : "text-foreground"} ${mono ? "font-mono text-[11px]" : "text-sm"}`}
  >
    {children}
  </td>
);

// ── Main page ─────────────────────────────────────────────────────────────────

interface DirOverflow {
  total: number;
  supported: number;
  pendingFiles: File[];
}

// Split an array into chunks of size n
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function IngestPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [files, setFiles] = useState<IngestFile[]>([]);
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [dirOverflow, setDirOverflow] = useState<DirOverflow | null>(null);
  const [openSections, setOpenSections] = useState({
    ready: true,
    duplicate: false,
    unsupported: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  function toggle(k: keyof typeof openSections) {
    setOpenSections((s) => ({ ...s, [k]: !s[k] }));
  }

  // ── Core processing: batched hash + duplicate check ────────────────────────

  const processFiles = useCallback(async (inputFiles: File[]) => {
    const capped = inputFiles.slice(0, DIR_FILE_LIMIT);
    setPhase("checking");
    setHashProgress({ done: 0, total: capped.length });
    setDirOverflow(null);
    setOpenSections({ ready: true, duplicate: false, unsupported: false });

    const allEntries: IngestFile[] = [];

    for (const batch of chunk(capped, 50)) {
      const batchEntries: IngestFile[] = [];
      for (const f of batch) {
        const hash = await hashFile(f);
        const rp =
          (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
          f.name;
        batchEntries.push({
          file: f,
          relativePath: rp,
          directory: getDir(rp),
          hash,
          checked: true,
          uploadStatus: "waiting",
        });
      }

      const results = await checkDuplicates(
        batchEntries.map((e) => ({
          filename: e.file.name,
          hash: e.hash!,
          size: e.file.size,
          mimetype: guessMimetype(e.file),
        })),
      );

      const map = new Map(results.map((r) => [r.hash, r]));
      for (const e of batchEntries) {
        const r = map.get(e.hash!);
        allEntries.push({
          ...e,
          checkStatus: r?.status,
          existingTitle: r?.existing_title,
          checked: r?.status === "new",
        });
      }

      setHashProgress({ done: allEntries.length, total: capped.length });
    }

    setFiles(allEntries);
    setPhase("reviewing");
  }, []);

  // ── Hashing + duplicate check ──────────────────────────────────────────────

  const handleFiles = useCallback(
    async (rawFiles: FileList, fromDir = false) => {
      const all = Array.from(rawFiles);
      if (!all.length) return;

      if (fromDir) {
        const supportedFiles = all
          .filter((f) => SUPPORTED.has(getExt(f.name)))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (supportedFiles.length > DIR_FILE_LIMIT) {
          setDirOverflow({
            total: all.length,
            supported: supportedFiles.length,
            pendingFiles: supportedFiles,
          });
          return;
        }

        await processFiles(supportedFiles);
      } else {
        await processFiles(all);
      }
    },
    [processFiles],
  );

  // ── Upload ─────────────────────────────────────────────────────────────────

  const startUpload = useCallback(async () => {
    setPhase("uploading");
    const queue = files.filter((e) => e.checkStatus === "new" && e.checked);

    for (const entry of queue) {
      setFiles((p) =>
        p.map((e) =>
          e.hash === entry.hash ? { ...e, uploadStatus: "uploading" } : e,
        ),
      );
      try {
        const res = await uploadDocument(entry.file, entry.hash!);
        setFiles((p) =>
          p.map((e) =>
            e.hash === entry.hash
              ? {
                  ...e,
                  uploadStatus: "uploaded",
                  docId: res.id,
                  processingStatus: "pending",
                }
              : e,
          ),
        );
      } catch (err) {
        setFiles((p) =>
          p.map((e) =>
            e.hash === entry.hash
              ? {
                  ...e,
                  uploadStatus: "error",
                  uploadError: err instanceof Error ? err.message : String(err),
                }
              : e,
          ),
        );
      }
    }
    setPhase("processing");
  }, [files]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const pendingDocIds = useMemo(
    () => files.filter((e) => e.docId && !isTerminal(e.processingStatus)).map((e) => e.docId!),
    [files],
  );

  const { data: statusUpdates } = useQuery({
    queryKey: ["processing-status", pendingDocIds],
    queryFn: async () => {
      const results = await Promise.allSettled(pendingDocIds.map((id) => getDocumentStatus(id)));
      return results.map((r, i) => ({
        docId: pendingDocIds[i],
        status: r.status === "fulfilled" ? r.value.status : undefined,
        error: r.status === "fulfilled" ? r.value.error : undefined,
      }));
    },
    enabled: phase === "processing" && pendingDocIds.length > 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!statusUpdates) return;
    setFiles((p) =>
      p.map((e) => {
        const r = statusUpdates.find((u) => u.docId === e.docId);
        if (!r || !r.status) return e;
        return { ...e, processingStatus: r.status, processingError: r.error ?? undefined };
      }),
    );
  }, [statusUpdates]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const newFiles = files.filter((e) => e.checkStatus === "new");
  const dupFiles = files.filter((e) => e.checkStatus === "duplicate");
  const unsupFiles = files.filter((e) => e.checkStatus === "unsupported");
  const checkedCount = newFiles.filter((e) => e.checked).length;
  const allChecked = newFiles.length > 0 && newFiles.every((e) => e.checked);
  const uploadedFiles = files.filter((e) => e.docId);
  const allTerminal =
    uploadedFiles.length > 0 &&
    uploadedFiles.every((e) => isTerminal(e.processingStatus));
  const isDirMode = files.some((f) => f.relativePath.includes("/"));

  const dirSummary = (() => {
    if (!isDirMode || !files.length) return "";
    const dirs = new Set(files.map((f) => f.directory).filter(Boolean));
    const extCounts = new Map<string, number>();
    for (const f of files) {
      const e = getExt(f.file.name);
      extCounts.set(e, (extCounts.get(e) ?? 0) + 1);
    }
    const parts: string[] = [];
    if (dirs.size)
      parts.push(`Scanned ${dirs.size} folder${dirs.size !== 1 ? "s" : ""}`);
    for (const ext of ["md", "txt"]) {
      const n = extCounts.get(ext) ?? 0;
      if (n) parts.push(`${n} .${ext}`);
    }
    for (const [ext, n] of extCounts) {
      if (!SUPPORTED.has(ext)) parts.push(`${n} .${ext} (unsupported)`);
    }
    return parts.join(" · ");
  })();

  const currentStep = phaseToStep(phase);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden inputs — no accept filter so unsupported types appear as unsupported */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.txt"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        accept=".md,.txt"
        className="hidden"
        {...({
          webkitdirectory: "",
        } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => e.target.files && handleFiles(e.target.files, true)}
      />

      <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-5 border-b border-border/40">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M10 3L5 8l5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Documents
          </Link>
          <h1 className="text-base font-semibold text-foreground">
            Ingest Files
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Upload <code className="font-mono">.md</code> or{" "}
            <code className="font-mono">.txt</code> files into the knowledge
            corpus. Other types will appear as unsupported.
          </p>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 px-8 py-5 border-b border-border/40">
          <StepIndicator current={currentStep} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* ── Directory overflow warning ── */}
          {phase === "idle" && dirOverflow && (
            <div className="max-w-md mx-auto space-y-4">
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-4 space-y-3">
                <p className="text-sm font-medium text-yellow-300">
                  Directory too large for browser ingestion
                </p>
                <p className="text-[12px] text-yellow-300/70">
                  This directory contains{" "}
                  <span className="font-mono">
                    {dirOverflow.total.toLocaleString()}
                  </span>{" "}
                  files (
                  <span className="font-mono">
                    {dirOverflow.supported.toLocaleString()}
                  </span>{" "}
                  supported types found). Browser ingestion is limited to{" "}
                  <span className="font-mono">{DIR_FILE_LIMIT}</span> files at a
                  time.
                </p>
                <p className="text-[12px] text-yellow-300/70">
                  For large directories, use the CLI tool:
                </p>
                <pre className="text-[11px] font-mono bg-black/30 rounded px-3 py-2 text-yellow-200/80 overflow-x-auto">
                  {`python ingest_cli.py --corpus-id <id> --path ./your-directory --limit 500`}
                </pre>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDirOverflow(null)}
                    className="px-3 py-1.5 text-[12px] rounded-lg border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      processFiles(dirOverflow.pendingFiles)
                    }
                    className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                  >
                    Ingest first {DIR_FILE_LIMIT.toLocaleString()} files
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Select ── */}
          {phase === "idle" && !dirOverflow && (
            <div className="max-w-md mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 border border-border/60 rounded-2xl hover:bg-surface/60 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground group"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="opacity-50 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13,2 13,9 20,9" />
                  </svg>
                  <div className="text-center">
                    <div className="text-sm font-medium">Pick files</div>
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                      Select individual files
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => dirInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 border border-border/60 rounded-2xl hover:bg-surface/60 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground group"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="opacity-50 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <div className="text-center">
                    <div className="text-sm font-medium">Pick folder</div>
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                      Scan an entire directory
                    </div>
                  </div>
                </button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground/50">
                Files are hashed client-side before anything is sent to the
                server.
              </p>
            </div>
          )}

          {/* ── Hashing / checking progress ── */}
          {(phase === "hashing" || phase === "checking") && (
            <div className="max-w-md mx-auto space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  {phase === "hashing"
                    ? `Hashing ${hashProgress.done} / ${hashProgress.total} files…`
                    : `Checking for duplicates… ${hashProgress.done} / ${hashProgress.total} files scanned`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full transition-all"
                  style={{
                    width: `${hashProgress.total ? (hashProgress.done / hashProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Review ── */}
          {phase === "reviewing" && (
            <div className="space-y-5">
              {isDirMode && dirSummary && (
                <p className="text-[11px] font-mono text-muted-foreground/70 bg-muted/20 rounded-lg px-4 py-2.5">
                  {dirSummary}
                </p>
              )}

              {/* Ready */}
              <Section
                title="Ready to ingest"
                count={newFiles.length}
                open={openSections.ready}
                onToggle={() => toggle("ready")}
              >
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline"
                    onClick={() =>
                      setFiles((p) =>
                        p.map((e) =>
                          e.checkStatus === "new"
                            ? { ...e, checked: !allChecked }
                            : e,
                        ),
                      )
                    }
                  >
                    {allChecked ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {newFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 py-3 pl-4">
                    None
                  </p>
                ) : (
                  <ReviewTable
                    header={
                      <>
                        <TH>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={() =>
                              setFiles((p) =>
                                p.map((e) =>
                                  e.checkStatus === "new"
                                    ? { ...e, checked: !allChecked }
                                    : e,
                                ),
                              )
                            }
                            className="accent-primary"
                          />
                        </TH>
                        <TH>Filename</TH>
                        {isDirMode && <TH>Path</TH>}
                        <TH right>Size</TH>
                        <TH right>Status</TH>
                      </>
                    }
                  >
                    {newFiles.map((e) => (
                      <tr
                        key={e.hash}
                        className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                      >
                        <TD>
                          <input
                            type="checkbox"
                            checked={e.checked}
                            onChange={() =>
                              setFiles((p) =>
                                p.map((f) =>
                                  f === e ? { ...f, checked: !f.checked } : f,
                                ),
                              )
                            }
                            className="accent-primary"
                          />
                        </TD>
                        <TD>{e.file.name}</TD>
                        {isDirMode && (
                          <TD muted mono>
                            {e.directory || "/"}
                          </TD>
                        )}
                        <TD right muted mono>
                          {formatBytes(e.file.size)}
                        </TD>
                        <TD right>
                          <span className="text-[10px] font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                            new
                          </span>
                        </TD>
                      </tr>
                    ))}
                  </ReviewTable>
                )}
              </Section>

              {/* Duplicates */}
              {dupFiles.length > 0 && (
                <Section
                  title="Skipped — already in corpus"
                  count={dupFiles.length}
                  badge="Re-ingest from the vault if you want to update"
                  open={openSections.duplicate}
                  onToggle={() => toggle("duplicate")}
                >
                  <ReviewTable
                    header={
                      <>
                        <TH>Filename</TH>
                        {isDirMode && <TH>Path</TH>}
                        <TH right>Size</TH>
                        <TH>Note</TH>
                      </>
                    }
                  >
                    {dupFiles.map((e) => (
                      <tr
                        key={e.hash}
                        className="border-t border-border/20 opacity-60"
                      >
                        <TD>{e.file.name}</TD>
                        {isDirMode && (
                          <TD muted mono>
                            {e.directory || "/"}
                          </TD>
                        )}
                        <TD right muted mono>
                          {formatBytes(e.file.size)}
                        </TD>
                        <TD muted>
                          {e.existingTitle ? (
                            <>duplicate of &ldquo;{e.existingTitle}&rdquo;</>
                          ) : (
                            "duplicate"
                          )}
                        </TD>
                      </tr>
                    ))}
                  </ReviewTable>
                </Section>
              )}

              {/* Unsupported */}
              {unsupFiles.length > 0 && (
                <Section
                  title="Not yet supported"
                  count={unsupFiles.length}
                  open={openSections.unsupported}
                  onToggle={() => toggle("unsupported")}
                >
                  <ReviewTable
                    header={
                      <>
                        <TH>Filename</TH>
                        {isDirMode && <TH>Path</TH>}
                        <TH right>Size</TH>
                        <TH>Note</TH>
                      </>
                    }
                  >
                    {unsupFiles.map((e) => {
                      const ext = getExt(e.file.name);
                      const note =
                        ext === "pdf"
                          ? "PDF support coming soon"
                          : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
                            ? "Image support coming soon"
                            : "File type not yet supported";
                      return (
                        <tr
                          key={e.hash}
                          className="border-t border-border/20 opacity-60"
                        >
                          <TD>{e.file.name}</TD>
                          {isDirMode && (
                            <TD muted mono>
                              {e.directory || "/"}
                            </TD>
                          )}
                          <TD right muted mono>
                            {formatBytes(e.file.size)}
                          </TD>
                          <TD muted>{note}</TD>
                        </tr>
                      );
                    })}
                  </ReviewTable>
                </Section>
              )}
            </div>
          )}

          {/* ── Upload progress ── */}
          {phase === "uploading" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Uploading files…
              </p>
              <ReviewTable
                header={
                  <>
                    <TH>Filename</TH>
                    <TH>Progress</TH>
                    <TH right>Size</TH>
                    <TH right>Status</TH>
                  </>
                }
              >
                {files
                  .filter((e) => e.checkStatus === "new" && e.checked)
                  .map((e) => (
                    <tr key={e.hash} className="border-t border-border/20">
                      <TD>{e.file.name}</TD>
                      <TD>
                        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden w-full min-w-20">
                          <div
                            className={`h-full rounded-full transition-all ${
                              e.uploadStatus === "uploaded"
                                ? "w-full bg-green-500/60"
                                : e.uploadStatus === "uploading"
                                  ? "w-1/2 bg-primary/60 animate-pulse"
                                  : e.uploadStatus === "error"
                                    ? "w-full bg-destructive/60"
                                    : "w-0"
                            }`}
                          />
                        </div>
                        {e.uploadError && (
                          <p className="text-[11px] text-destructive mt-0.5">
                            {e.uploadError}
                          </p>
                        )}
                      </TD>
                      <TD right muted mono>
                        {formatBytes(e.file.size)}
                      </TD>
                      <TD right>
                        <span
                          className={`text-[11px] font-mono ${
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
                            ? "✓ uploaded"
                            : e.uploadStatus === "error"
                              ? "✗ error"
                              : e.uploadStatus === "uploading"
                                ? "uploading…"
                                : "waiting"}
                        </span>
                      </TD>
                    </tr>
                  ))}
              </ReviewTable>
            </div>
          )}

          {/* ── Processing ── */}
          {phase === "processing" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Building knowledge graph…
              </p>
              <ReviewTable
                header={
                  <>
                    <TH>Filename</TH>
                    <TH>Status</TH>
                    <TH>Details</TH>
                  </>
                }
              >
                {uploadedFiles.map((e) => (
                  <tr key={e.docId} className="border-t border-border/20">
                    <TD>{e.file.name || e.relativePath}</TD>
                    <TD>
                      {(!e.processingStatus ||
                        e.processingStatus === "pending") && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          ○ Queued
                        </span>
                      )}
                      {e.processingStatus === "processing" && (
                        <span className="text-[11px] font-mono text-yellow-400 flex items-center gap-1.5">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-yellow-400 border-t-transparent" />
                          Processing
                        </span>
                      )}
                      {e.processingStatus === "ready" && (
                        <span className="text-[11px] font-mono text-green-400">
                          ✓ Ready
                        </span>
                      )}
                      {e.processingStatus === "failed" && (
                        <span className="text-[11px] font-mono text-destructive">
                          ✗ Failed
                        </span>
                      )}
                    </TD>
                    <TD muted>
                      {e.processingStatus === "processing" && (
                        <span className="text-[11px]">
                          Building knowledge graph…
                        </span>
                      )}
                      {e.processingStatus === "failed" && (
                        <span className="flex items-center gap-2">
                          {e.processingError && (
                            <span
                              className="text-[11px] text-destructive/70"
                              title={e.processingError}
                            >
                              {e.processingError.length > 60
                                ? e.processingError.slice(0, 60) + "…"
                                : e.processingError}
                            </span>
                          )}
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline shrink-0"
                            onClick={async () => {
                              await reIngestDocument(e.docId!);
                              setFiles((p) =>
                                p.map((f) =>
                                  f.docId === e.docId
                                    ? {
                                        ...f,
                                        processingStatus: "pending",
                                        processingError: undefined,
                                      }
                                    : f,
                                ),
                              );
                            }}
                          >
                            Retry
                          </button>
                        </span>
                      )}
                    </TD>
                  </tr>
                ))}
              </ReviewTable>

              {allTerminal && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <span className="text-green-400 text-sm">✓</span>
                  <span className="text-sm text-green-400">
                    All {uploadedFiles.length} file
                    {uploadedFiles.length !== 1 ? "s" : ""} processed
                    successfully.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-border/40 flex items-center justify-between gap-3">
          <div>
            {phase !== "idle" && phase !== "processing" && (
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setFiles([]);
                  setDirOverflow(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Start over
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {phase === "idle" && (
              <Link href="/documents">
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </Link>
            )}

            {phase === "reviewing" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/documents")}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={checkedCount === 0}
                  onClick={startUpload}
                >
                  {checkedCount === 0
                    ? "Nothing to ingest"
                    : `Ingest ${checkedCount} file${checkedCount !== 1 ? "s" : ""}`}
                </Button>
              </>
            )}

            {(phase === "hashing" ||
              phase === "checking" ||
              phase === "uploading") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/documents")}
              >
                Close
              </Button>
            )}

            {phase === "processing" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/documents")}
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={!allTerminal}
                  onClick={() => router.push("/documents")}
                >
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
