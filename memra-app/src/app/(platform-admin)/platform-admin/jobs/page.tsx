"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  running: "default",
  done: "default",
  failed: "destructive",
  cancelled: "outline",
  retrying: "secondary",
};

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
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Job Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Monitor and manage background processing jobs
        </p>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats).map(([key, val]) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"
            >
              <span className="text-xs text-muted-foreground capitalize">{key}:</span>
              <span className="text-xs font-mono font-medium">{val}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        {tabs.map(({ key, label }) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
            className="h-8 text-xs"
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "failed" && hasSelection && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="outline" className="text-xs">
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

      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !jobs.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No jobs found
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {tab === "failed" && (
                  <th className="w-8 py-2 px-2" />
                )}
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Type
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Status
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Org
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Created
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Started
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Duration
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Attempts
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Error
                </th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <>
                  <tr
                    key={job.id}
                    className="border-b border-border/50 hover:bg-muted/20"
                  >
                    {tab === "failed" && (
                      <td className="py-1.5 px-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          className="rounded border-border"
                        />
                      </td>
                    )}
                    <td className="py-1.5 px-2 font-mono">{job.type}</td>
                    <td className="py-1.5 px-2">
                      <Badge
                        variant={STATUS_VARIANT[job.status] ?? "outline"}
                        className="text-[10px] font-mono"
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2 max-w-[120px] truncate">
                      {job.org_name ?? job.org_id ?? "—"}
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground" title={job.created_at}>
                      {formatRelative(job.created_at)}
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground">
                      {formatRelative(job.started_at)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">
                      {formatDuration(job.started_at, job.finished_at)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td
                      className="py-1.5 px-2 text-destructive max-w-[200px] cursor-pointer"
                      onClick={() =>
                        setExpandedErrorId(expandedErrorId === job.id ? null : job.id)
                      }
                      title={job.error ?? undefined}
                    >
                      {truncate(job.error, 80)}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-2">
                        {job.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retryMutation.mutate(job.id)}
                            disabled={retryMutation.isPending}
                            className="h-6 text-[11px] text-emerald-400 hover:text-emerald-300"
                          >
                            Retry
                          </Button>
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
                                  className="h-6 text-[11px] text-destructive hover:text-destructive"
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
                  {expandedErrorId === job.id && job.error_trace && (
                    <tr key={`${job.id}-trace`}>
                      <td
                        colSpan={tab === "failed" ? 10 : 9}
                        className="py-2 px-2 bg-muted/20 border-b border-border/50"
                      >
                        <pre className="text-[10px] font-mono text-destructive/80 whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
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

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="text-xs font-mono text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
