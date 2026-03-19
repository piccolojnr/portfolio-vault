"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getJobs,
  getStats,
  retryJob,
  type Job,
  type JobStats,
} from "@/lib/admin";

type TabStatus = "all" | "running" | "failed" | "pending";

const ACTIVE_TABS = new Set<TabStatus>(["all", "running", "pending"]);

function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string {
  if (!startedAt) return "—";
  const ms =
    (finishedAt ? new Date(finishedAt) : new Date()).getTime() -
    new Date(startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  running: "Processing",
  done: "Ready",
  retrying: "Retrying",
  failed: "Failed",
};

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
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 rounded-xl border ${warn && value > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/40 bg-surface/30"}`}
    >
      <div
        className={`text-xl font-mono font-semibold ${warn && value > 0 ? "text-red-400" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function PayloadModal({ job, onClose }: { job: Job; onClose: () => void }) {
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
            <span className="text-sm font-semibold">{job.type}</span>
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
              {job.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
          Payload
        </p>
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

function entityLink(job: Job) {
  if (
    (job.type === "ingest_document" || job.type === "reingest_document") &&
    job.payload.document_id
  ) {
    return (
      <Link
        href="/documents"
        className="text-primary hover:underline text-[11px]"
      >
        doc
      </Link>
    );
  }
  if (job.type === "summarise_conversation" && job.payload.conversation_id) {
    return (
      <Link
        href={`/${job.payload.conversation_id}`}
        className="text-primary hover:underline text-[11px]"
      >
        conv
      </Link>
    );
  }
  return null;
}

const JOBS_LIMIT = 50;

export default function AdminJobsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabStatus>("all");
  const [offset, setOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { data: stats } = useQuery<JobStats>({
    queryKey: ["job-stats"],
    queryFn: getStats,
    refetchInterval: 5000,
  });

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["jobs", tab, offset],
    queryFn: () =>
      getJobs({
        status: tab === "all" ? undefined : tab,
        limit: JOBS_LIMIT,
        offset,
      }),
    refetchInterval: ACTIVE_TABS.has(tab) ? 5000 : false,
  });

  const retry = useMutation({
    mutationFn: retryJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-stats"] });
    },
  });

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
    { key: "pending", label: "Pending" },
  ];

  const navLink = (active: boolean) =>
    `px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Worker warning */}
        {stats?.worker_connected === false && (
          <div className="flex items-start gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <span className="text-yellow-400 mt-0.5 shrink-0">!</span>
            <div>
              <p className="text-sm font-medium text-yellow-300">
                Worker not connected
              </p>
              <p className="text-[11px] text-yellow-300/70 mt-0.5">
                No worker has polled in the last 60 s. Run{" "}
                <code className="font-mono">rag worker</code> to process pending
                jobs.
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
              onClick={() => {
                setTab(key);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-surface/40 animate-pulse"
              />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 py-4">
            No jobs found.
          </p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  {[
                    "Type",
                    "Status",
                    "Created",
                    "Started",
                    "Finished",
                    "Duration",
                    "Attempts",
                    "Worker",
                    "Error",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className={`border-t border-border/20 hover:bg-surface/30 transition-colors ${job.status === "failed" ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-3 py-2.5 text-[12px] font-mono whitespace-nowrap">
                      {job.type} <span className="ml-1">{entityLink(job)}</span>
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
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground max-w-30 truncate">
                      {job.worker_id ?? "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-[11px] text-red-400/80 max-w-40 truncate"
                      title={job.error ?? ""}
                    >
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
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedJob(job)}
                        >
                          Payload
                        </button>
                        {job.status === "failed" && (
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline disabled:opacity-40"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(job.id)}
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

        {/* Pagination */}
        {(jobs.length === JOBS_LIMIT || offset > 0) && (
          <div className="flex items-center gap-2 justify-center py-4">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - JOBS_LIMIT))}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-mono text-muted-foreground/50">
              {offset + 1}–{offset + jobs.length}
            </span>
            <button
              type="button"
              disabled={jobs.length < JOBS_LIMIT}
              onClick={() => setOffset(offset + JOBS_LIMIT)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {selectedJob && (
        <PayloadModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
