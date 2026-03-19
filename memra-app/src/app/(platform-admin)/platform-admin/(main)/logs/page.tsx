"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";

const CALL_TYPES = [
  "all",
  "chat",
  "embed",
  "classify",
  "summarise",
  "entity_extract",
  "query",
] as const;
type CallTypeFilter = (typeof CALL_TYPES)[number];

interface LogRow {
  id: string;
  org_id: string | null;
  org_name: string | null;
  user_id: string | null;
  user_email: string | null;
  call_type: string;
  model: string | null;
  provider: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface LogsResponse {
  logs: LogRow[];
  total: number;
  total_cost: string;
  page: number;
  limit: number;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function buildLogsUrl(params: {
  callTypes: string[];
  from: string;
  to: string;
  orgId: string;
  page: number;
  limit: number;
}): string {
  const sp = new URLSearchParams();
  params.callTypes.forEach((t) => sp.append("call_type", t));
  sp.set("from", params.from);
  sp.set("to", params.to);
  if (params.orgId) sp.set("org_id", params.orgId);
  sp.set("page", String(params.page));
  sp.set("limit", String(params.limit));
  return `/api/platform/logs?${sp.toString()}`;
}

function TypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    chat: "bg-primary/15 text-primary border-primary/20",
    embed: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    classify: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    summarise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    entity_extract: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    query: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium whitespace-nowrap ${colors[type] ?? "bg-muted/30 text-muted-foreground border-border/30"}`}
    >
      {type}
    </span>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function PlatformAdminLogsPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [typeFilter, setTypeFilter] = useState<CallTypeFilter>("all");
  const [from, setFrom] = useState(yesterday.toISOString().slice(0, 16));
  const [to, setTo] = useState(now.toISOString().slice(0, 16));
  const [orgId, setOrgId] = useState("");
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callTypes =
    typeFilter === "all" ? [] : [typeFilter];

  const url = buildLogsUrl({
    callTypes,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    orgId: orgId.trim(),
    page,
    limit: 50,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "logs", url],
    queryFn: () => adminFetch<LogsResponse>(url),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const handleExportCsv = useCallback(async () => {
    const exportUrl = buildLogsUrl({
      callTypes,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      orgId: orgId.trim(),
      page: 1,
      limit: 10000,
    });
    const res = await adminFetch<LogsResponse>(exportUrl);
    const rows = res.logs ?? [];
    const headers = [
      "id", "org_id", "org_name", "user_id", "user_email",
      "call_type", "model", "provider", "input_tokens", "output_tokens",
      "cost_usd", "duration_ms", "created_at",
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv =
      headers.join(",") +
      "\n" +
      rows
        .map((r) =>
          headers.map((h) => escape((r as unknown as Record<string, unknown>)[h])).join(",")
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [callTypes, from, to, orgId]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            API Call Logs
          </h1>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Total Cost"
            value={data ? `$${parseFloat(data.total_cost ?? "0").toFixed(2)}` : "—"}
          />
          <StatCard
            label="Total Calls"
            value={data ? String(data.total) : "—"}
          />
          <div
            className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30 cursor-pointer select-none"
            onClick={() => setAutoRefresh((r) => !r)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setAutoRefresh((r) => !r);
              }
            }}
          >
            <div className="text-lg font-mono font-semibold text-foreground">
              {autoRefresh ? "ON" : "OFF"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Auto-refresh
            </div>
          </div>
        </div>

        {/* Filter area */}
        <div className="shrink-0 flex flex-wrap items-center gap-3">
          {CALL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${typeFilter === t ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
            >
              {t}
            </button>
          ))}
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="Org ID (optional)"
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-[11px] font-mono w-40 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-surface/40 animate-pulse"
              />
            ))}
          </div>
        ) : !data?.logs?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No logs found
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/10">
                <tr>
                  {[
                    "Time",
                    "Org",
                    "User",
                    "Type",
                    "Model",
                    "In Tokens",
                    "Out Tokens",
                    "Cost",
                    "Duration",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.logs.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-[11px] font-mono" title={row.created_at}>
                      {formatRelative(row.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono max-w-[120px] truncate">
                      {row.org_name ?? row.org_id ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono max-w-[140px] truncate">
                      {row.user_email ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <TypePill type={row.call_type} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {row.model ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-right text-muted-foreground">
                      {row.input_tokens ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-right text-muted-foreground">
                      {row.output_tokens ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-right">
                      ${(parseFloat(row.cost_usd ?? "0") ?? 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-right text-muted-foreground">
                      {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
    </div>
  );
}
