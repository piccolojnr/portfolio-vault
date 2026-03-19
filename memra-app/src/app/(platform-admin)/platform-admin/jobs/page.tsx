"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

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

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  return `${ms}ms`;
}

function truncate(str: string | null, len: number): string {
  if (!str) return "—";
  return str.length <= len ? str : str.slice(0, len) + "…";
}

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  running: "bg-blue-500/20 text-blue-400",
  done: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-neutral-600/30 text-neutral-400",
  retrying: "bg-orange-500/20 text-orange-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
        STATUS_CLASS[status] ?? "bg-neutral-700/50 text-neutral-400"
      }`}
    >
      {status}
    </span>
  );
}

export default function PlatformAdminJobsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

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

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-200 p-6">
      <h1 className="text-lg font-medium text-neutral-200 mb-4">Job Queue</h1>

      {/* Stats bar */}
      {stats && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-2.5 py-1 rounded border border-neutral-700 text-[11px] font-mono">
            Pending: {stats.pending}
          </span>
          <span className="px-2.5 py-1 rounded border border-neutral-700 text-[11px] font-mono">
            Running: {stats.running}
          </span>
          <span className="px-2.5 py-1 rounded border border-neutral-700 text-[11px] font-mono">
            Done: {stats.done}
          </span>
          <span className="px-2.5 py-1 rounded border border-neutral-700 text-[11px] font-mono">
            Failed: {stats.failed}
          </span>
          <span className="px-2.5 py-1 rounded border border-neutral-700 text-[11px] font-mono">
            Cancelled: {stats.cancelled}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded text-[12px] border ${
              tab === key
                ? "border-neutral-600 bg-neutral-800 text-neutral-200"
                : "border-neutral-800 bg-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bulk retry */}
      {tab === "failed" && hasSelection && (
        <div className="mb-3">
          <button
            type="button"
            onClick={bulkRetry}
            disabled={retryMutation.isPending}
            className="text-[11px] px-3 py-1.5 rounded border border-green-700 bg-green-900/30 text-green-400 hover:bg-green-800/30 disabled:opacity-50"
          >
            Retry Selected ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded border border-neutral-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-500 text-[12px]">
            Loading...
          </div>
        ) : !jobs.length ? (
          <div className="p-8 text-center text-neutral-500 text-[12px]">
            No jobs found
          </div>
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-[#141414]">
                {tab === "failed" && (
                  <th className="w-8 py-2 px-2 text-neutral-500" />
                )}
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Type
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Status
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Org
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Created
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Started
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Duration
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Attempts
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Error
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <>
                  <tr
                    key={job.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
                  >
                    {tab === "failed" && (
                      <td className="py-1.5 px-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          className="rounded border-neutral-600 bg-neutral-800"
                        />
                      </td>
                    )}
                    <td className="py-1.5 px-2 font-mono text-neutral-300">
                      {job.type}
                    </td>
                    <td className="py-1.5 px-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-1.5 px-2 text-neutral-300 max-w-[120px] truncate">
                      {job.org_name ?? job.org_id ?? "—"}
                    </td>
                    <td
                      className="py-1.5 px-2 text-neutral-400"
                      title={job.created_at}
                    >
                      {formatRelative(job.created_at)}
                    </td>
                    <td className="py-1.5 px-2 text-neutral-400">
                      {formatRelative(job.started_at)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-neutral-400">
                      {formatDuration(job.started_at, job.finished_at)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-neutral-400">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td
                      className="py-1.5 px-2 text-red-400/80 max-w-[200px] cursor-pointer"
                      onClick={() =>
                        setExpandedErrorId(
                          expandedErrorId === job.id ? null : job.id
                        )
                      }
                      title={job.error ?? undefined}
                    >
                      {truncate(job.error, 80)}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-2">
                        {job.status === "failed" && (
                          <button
                            type="button"
                            onClick={() => retryMutation.mutate(job.id)}
                            disabled={retryMutation.isPending}
                            className="text-[11px] text-green-400 hover:underline disabled:opacity-50"
                          >
                            Retry
                          </button>
                        )}
                        {(job.status === "pending" ||
                          job.status === "running" ||
                          job.status === "retrying") && (
                          <button
                            type="button"
                            onClick={() => cancelMutation.mutate(job.id)}
                            disabled={cancelMutation.isPending}
                            className="text-[11px] text-red-400 hover:underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedErrorId === job.id && job.error_trace && (
                    <tr key={`${job.id}-trace`}>
                      <td
                        colSpan={tab === "failed" ? 10 : 9}
                        className="py-2 px-2 bg-neutral-900/50 border-b border-neutral-800/50"
                      >
                        <pre className="text-[10px] font-mono text-red-300/90 whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                          {job.error_trace}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-[11px] font-mono text-neutral-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
