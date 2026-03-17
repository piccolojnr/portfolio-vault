"use client";

// TODO: protect with auth when multi-tenancy is implemented

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getJobs, getStats, retryJob, type Job, type JobStats } from "@/lib/jobs";

type TabStatus = "all" | "running" | "failed" | "pending";

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: "bg-muted/40 text-muted-foreground",
    running: "bg-yellow-500/20 text-yellow-400",
    done: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    retrying: "bg-orange-500/20 text-orange-400",
  };
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cls[status] ?? "bg-muted/20 text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`px-4 py-3 rounded-xl border ${warn && value > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/40 bg-surface/30"}`}>
      <div className={`text-xl font-mono font-semibold ${warn && value > 0 ? "text-red-400" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

interface PayloadModalProps {
  job: Job;
  onClose: () => void;
}

function PayloadModal({ job, onClose }: PayloadModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border/60 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-sm font-semibold text-foreground">{job.type}</span>
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">{job.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Payload</p>
        <pre className="text-[12px] font-mono bg-muted/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(job.payload, null, 2)}
        </pre>
        {job.error_trace && (
          <>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-4 mb-1">
              Error Trace
            </p>
            <pre className="text-[11px] font-mono bg-red-500/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-red-300 break-all">
              {job.error_trace}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function entityLink(job: Job): React.ReactNode {
  if (job.type === "ingest_document" || job.type === "reingest_document") {
    const docId = job.payload.document_id as string | undefined;
    if (docId) {
      return (
        <Link href={`/documents`} className="text-primary hover:underline text-[11px]">
          doc
        </Link>
      );
    }
  }
  if (job.type === "summarise_conversation") {
    const convId = job.payload.conversation_id as string | undefined;
    if (convId) {
      return (
        <Link href={`/${convId}`} className="text-primary hover:underline text-[11px]">
          conv
        </Link>
      );
    }
  }
  return null;
}

export default function AdminJobsPage() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<TabStatus>("all");
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const tabRef = useRef<TabStatus>(tab);
  tabRef.current = tab;

  const load = useCallback(async () => {
    try {
      const [newStats, newJobs] = await Promise.all([
        getStats(),
        getJobs({ status: tabRef.current === "all" ? undefined : tabRef.current, limit: 100 }),
      ]);
      setStats(newStats);
      setJobs(newJobs);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [tab, load]);

  // Auto-refresh when tab is running or pending
  useEffect(() => {
    if (tab !== "running" && tab !== "pending" && tab !== "all") return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [tab, load]);

  const handleRetry = async (job: Job) => {
    try {
      await retryJob(job.id);
      await load();
    } catch {
      // ignore
    }
  };

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
    { key: "pending", label: "Pending" },
  ];

  const navLink = (active: boolean) =>
    `px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${
      active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-surface"
    }`;

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border/40">
        <h1 className="text-base font-semibold text-foreground">Job Queue</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Monitor background ingestion and summarisation jobs.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Worker warning */}
        {stats?.worker_connected === false && (
          <div className="flex items-start gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <span className="text-yellow-400 mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-yellow-300">Worker not connected</p>
              <p className="text-[11px] text-yellow-300/70 mt-0.5">
                No worker has polled in the last 60 seconds. Pending jobs will not be processed
                until a worker is running.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Pending" value={stats.pending} />
            <StatCard label="Running" value={stats.running} />
            <StatCard label="Retrying" value={stats.retrying} />
            <StatCard label="Failed" value={stats.failed} warn />
            <StatCard label="Done" value={stats.done} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={navLink(tab === key)}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading…
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 py-4">No jobs found.</p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  {["Type", "Status", "Created", "Started", "Finished", "Duration", "Attempts", "Worker", "Error", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className={`border-t border-border/20 hover:bg-surface/30 transition-colors ${
                      job.status === "failed" ? "bg-red-500/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 text-[12px] font-mono whitespace-nowrap">
                      <span>{job.type}</span>
                      <span className="ml-1">{entityLink(job)}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(job.finished_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDuration(job.started_at, job.finished_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground text-center">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground max-w-[120px] truncate">
                      {job.worker_id ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-red-400/80 max-w-[160px] truncate" title={job.error ?? ""}>
                      {job.error
                        ? job.error.length > 60
                          ? job.error.slice(0, 60) + "…"
                          : job.error
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setSelectedJob(job)}
                        >
                          Payload
                        </button>
                        {job.status === "failed" && (
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline"
                            onClick={() => handleRetry(job)}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedJob && (
        <PayloadModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
