"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getCostEstimate,
  listRuns,
  runPipeline,
  type CostEstimate,
  type PipelineEvent,
  type PipelineRunList,
  type PipelineRunSummary,
} from "@/lib/pipeline";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "success"
      ? "bg-green-500/15 text-green-400 border-green-500/25"
      : status === "failed"
        ? "bg-red-500/15 text-red-400 border-red-500/25"
        : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

// ── Progress log ───────────────────────────────────────────────────────────────

type LogLine = { ts: string; text: string };

function ProgressLog({ lines }: { lines: LogLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-5 text-muted-foreground max-h-48 overflow-y-auto">
      {lines.map((l, i) => (
        <div key={i}>
          <span className="text-primary/40 mr-2">{l.ts}</span>
          {l.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Run history table ──────────────────────────────────────────────────────────

function RunTable({
  data,
  page,
  onPage,
}: {
  data: PipelineRunList;
  page: number;
  onPage: (p: number) => void;
}) {
  if (data.total === 0) {
    return (
      <p className="text-[13px] text-muted-foreground text-center py-8">
        No pipeline runs yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface/50 text-left text-muted-foreground font-mono">
              <th className="px-4 py-2 font-medium">status</th>
              <th className="px-4 py-2 font-medium">chunks</th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">model</th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">by</th>
              <th className="px-4 py-2 font-medium">duration</th>
              <th className="px-4 py-2 font-medium">started</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((run) => (
              <RunRow key={run.run_id} run={run} />
            ))}
          </tbody>
        </table>
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {data.total} runs · page {page} of {data.pages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="h-7 px-2 text-[11px]"
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pages}
              onClick={() => onPage(page + 1)}
              className="h-7 px-2 text-[11px]"
            >
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: PipelineRunSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-surface/40 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-2.5">
          <StatusBadge status={run.status} />
        </td>
        <td className="px-4 py-2.5 font-mono text-foreground">
          {run.chunk_count ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground font-mono text-[10px] hidden sm:table-cell">
          {run.model ?? "—"}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground font-mono hidden sm:table-cell">
          {run.triggered_by}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground font-mono">
          {formatDuration(run.started_at, run.finished_at)}
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">
          {formatRelative(run.started_at)}
        </td>
      </tr>
      {expanded && run.error && (
        <tr className="bg-red-950/20">
          <td colSpan={6} className="px-4 py-2">
            <p className="font-mono text-[11px] text-red-400">{run.error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [runsData, setRunsData] = useState<PipelineRunList | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);

  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const addLog = useCallback((text: string) => {
    const ts = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogLines((prev) => [...prev, { ts, text }]);
  }, []);

  // Load cost estimate
  useEffect(() => {
    getCostEstimate()
      .then(setEstimate)
      .catch((e) => setEstimateError(e.message));
  }, []);

  // Load run history
  useEffect(() => {
    let cancelled = false;

    listRuns(runsPage, 10)
      .then((data) => {
        if (cancelled) return;
        setRunsData(data);
        setRunsError(null);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setRunsData(null);
        setRunsError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [runsPage]);

  const handleRunPipeline = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setLogLines([]);

    await runPipeline(
      (ev: PipelineEvent) => {
        switch (ev.event) {
          case "run_id":
            addLog(`Run started · id: ${ev.run_id.slice(0, 8)}…`);
            break;
          case "started":
            addLog(
              `Processing ${ev.doc_count} document${ev.doc_count !== 1 ? "s" : ""}`,
            );
            break;
          case "chunked":
            addLog(`Chunked → ${ev.chunk_count} chunks`);
            break;
          case "embedded":
            addLog(`Embeddings computed for ${ev.chunk_count} chunks`);
            break;
          case "done":
            addLog(`Done · ${ev.chunk_count} chunks stored in Qdrant`);
            break;
          case "error":
            addLog(`Error: ${ev.message}`);
            setRunError(ev.message);
            break;
        }
      },
      () => {
        setRunning(false);
        setRunsData(null);
        setRunsError(null);
        setRunsPage(1);
        // Refresh cost estimate
        getCostEstimate()
          .then(setEstimate)
          .catch(() => {});
      },
      (err) => {
        setRunError(err.message);
        setRunning(false);
      },
    );
  }, [addLog]);

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 py-6 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Pipeline
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Chunk, embed, and index vault documents into Qdrant.
            </p>
          </div>

          {/* Cost estimate + run button */}
          <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-4">
            <h2 className="text-[13px] font-semibold text-foreground font-mono">
              Run full pipeline
            </h2>

            {estimateError ? (
              <p className="text-[12px] text-red-400">{estimateError}</p>
            ) : estimate ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <EstimateCard
                  label="documents"
                  value={String(estimate.doc_count)}
                />
                <EstimateCard
                  label="chunks"
                  value={String(estimate.chunk_count)}
                />
                <EstimateCard
                  label="est. tokens"
                  value={estimate.token_count.toLocaleString()}
                />
                <EstimateCard
                  label="est. cost"
                  value={
                    estimate.estimated_cost_usd < 0.001
                      ? "< $0.001"
                      : `$${estimate.estimated_cost_usd.toFixed(4)}`
                  }
                  sub={estimate.model}
                />
              </div>
            ) : (
              <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleRunPipeline}
                disabled={running}
                className="h-8 px-4 font-mono text-[12px]"
              >
                {running ? (
                  <>
                    <svg
                      className="mr-2 h-3 w-3 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    running…
                  </>
                ) : (
                  "run pipeline"
                )}
              </Button>

              {runError && (
                <p className="text-[12px] text-red-400">{runError}</p>
              )}
            </div>

            <ProgressLog lines={logLines} />
          </section>

          {/* Run history */}
          <section className="space-y-3">
            <h2 className="text-[13px] font-semibold text-foreground font-mono">
              Run history
            </h2>

            {runsData === null && !runsError ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-muted/30"
                  />
                ))}
              </div>
            ) : runsData ? (
              <RunTable
                data={runsData}
                page={runsPage}
                onPage={(p) => {
                  setRunsData(null);
                  setRunsError(null);
                  setRunsPage(p);
                }}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {runsError ?? "Failed to load run history."}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EstimateCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg/60 px-3 py-2.5">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold text-foreground font-mono">
        {value}
      </p>
      {sub && (
        <p className="text-[9px] text-muted-foreground/70 font-mono truncate mt-0.5">
          {sub}
        </p>
      )}
    </div>
  );
}
