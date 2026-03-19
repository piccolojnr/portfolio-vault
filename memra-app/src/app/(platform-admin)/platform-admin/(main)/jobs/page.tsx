"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface JobStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
  retrying: number;
  cancelled: number;
}

interface Job {
  id: string;
  type: string;
  status: string;
  org_name: string | null;
  org_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  max_attempts: number;
  error: string | null;
  error_trace: string | null;
  worker_id: string | null;
}

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

type TabStatus = "all" | "pending" | "running" | "failed";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  running: "Processing",
  done: "Ready",
  retrying: "Retrying",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: "bg-muted/40 text-muted-foreground",
    running: "bg-yellow-500/20 text-yellow-400",
    done: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-muted/20 text-muted-foreground",
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

export default function PlatformAdminJobsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const statusFilter = tab === "all" ? undefined : tab;

  const { data: stats } = useQuery({
    queryKey: ["platform", "jobs", "stats"],
    queryFn: () => adminFetch<JobStats>("/api/platform/jobs/stats"),
    refetchInterval: 5000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "jobs", statusFilter, page],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set("status", statusFilter);
      sp.set("page", String(page));
      sp.set("limit", "50");
      return adminFetch<JobsResponse>(
        `/api/platform/jobs?${sp.toString()}`
      );
    },
    refetchInterval: 5000,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      adminFetch<{ status: string }>(
        `/api/platform/jobs/${jobId}/retry`,
        { method: "POST" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "jobs"] });
      setSelectedIds(new Set());
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) =>
      adminFetch<{ status: string }>(
        `/api/platform/jobs/${jobId}/cancel`,
        { method: "POST" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "jobs"] });
    },
  });

  const jobs = data?.jobs ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;
  const hasSelection = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkRetry = () => {
    selectedIds.forEach((id) => retryMutation.mutate(id));
  };

  const navLink = (active: boolean) =>
    `px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`;

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Job Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor and manage background processing jobs
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-6 gap-3">
            <StatCard label="Pending" value={stats.pending} />
            <StatCard label="Running" value={stats.running} />
            <StatCard label="Retrying" value={stats.retrying} />
            <StatCard label="Failed" value={stats.failed} warn />
            <StatCard label="Cancelled" value={stats.cancelled} />
            <StatCard label="Done" value={stats.done} />
          </div>
        )}

        <div className="flex items-center gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={navLink(tab === key)}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
          {tab === "failed" && hasSelection && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button size="sm" variant="outline" className="text-xs ml-2">
                    Retry Selected ({selectedIds.size})
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Retry {selectedIds.size} failed jobs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will re-queue the selected failed jobs for another attempt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkRetry}>
                    Retry Jobs
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-surface/40 animate-pulse"
              />
            ))}
          </div>
        ) : !jobs.length ? (
          <p className="text-sm text-muted-foreground/50 py-4">
            No jobs found.
          </p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  {tab === "failed" && (
                    <th className="w-8 px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left" />
                  )}
                  {[
                    "Type",
                    "Status",
                    "Org",
                    "Created",
                    "Started",
                    "Duration",
                    "Attempts",
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
                    {tab === "failed" && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          className="rounded border-border"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-[12px] font-mono whitespace-nowrap">
                      {job.type}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground max-w-[120px] truncate">
                      {job.org_name ?? job.org_id ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap" title={job.created_at}>
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDuration(job.started_at, job.finished_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground text-center">
                      {job.attempts}/{job.max_attempts}
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
                          View
                        </button>
                        {job.status === "failed" && (
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline disabled:opacity-40"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(job.id)}
                          >
                            Retry
                          </button>
                        )}
                        {(job.status === "pending" ||
                          job.status === "running" ||
                          job.status === "retrying") && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={cancelMutation.isPending}
                                  className="h-auto p-0 text-[11px] text-destructive hover:text-destructive"
                                >
                                  Cancel
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel job?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will cancel the <strong>{job.type}</strong> job.
                                  The job cannot be resumed once cancelled.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep Running</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => cancelMutation.mutate(job.id)}
                                >
                                  Cancel Job
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center gap-2 justify-center py-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => p + 1)}
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
