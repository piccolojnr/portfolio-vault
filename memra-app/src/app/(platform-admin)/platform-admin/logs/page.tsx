"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

const CALL_TYPES = [
  "chat",
  "embed",
  "classify",
  "summarise",
  "entity_extract",
  "query",
] as const;

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
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: string;
}

interface LogsResponse {
  logs: LogRow[];
  total: number;
  total_cost: number;
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

export default function PlatformAdminLogsPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [callTypes, setCallTypes] = useState<string[]>([]);
  const [from, setFrom] = useState(yesterday.toISOString().slice(0, 16));
  const [to, setTo] = useState(now.toISOString().slice(0, 16));
  const [orgId, setOrgId] = useState("");
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const toggleCallType = (t: string) => {
    setCallTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

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
      "id",
      "org_id",
      "org_name",
      "user_id",
      "user_email",
      "call_type",
      "model",
      "provider",
      "input_tokens",
      "output_tokens",
      "cost_usd",
      "duration_ms",
      "created_at",
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

  const totalPages = data
    ? Math.ceil(data.total / data.limit)
    : 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium text-neutral-200">API Call Logs</h1>
        <button
          type="button"
          onClick={handleExportCsv}
          className="text-[11px] px-3 py-1.5 rounded border border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/50"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded border border-neutral-800 bg-[#141414]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500 uppercase">Type:</span>
          {CALL_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={callTypes.includes(t)}
                onChange={() => toggleCallType(t)}
                className="rounded border-neutral-600 bg-neutral-800"
              />
              {t}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">From</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-[11px] font-mono px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">To</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-[11px] font-mono px-2 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">Org ID</span>
          <input
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="optional"
            className="text-[11px] font-mono px-2 py-1 w-40 rounded border border-neutral-700 bg-neutral-900 text-neutral-200 placeholder-neutral-600"
          />
        </div>
        <button
          type="button"
          onClick={() => setAutoRefresh((r) => !r)}
          className={`text-[11px] px-3 py-1 rounded border ${
            autoRefresh
              ? "border-green-600 bg-green-900/30 text-green-400"
              : "border-neutral-700 bg-neutral-800/50 text-neutral-400"
          }`}
        >
          {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        </button>
      </div>

      {/* Total cost */}
      {data && (
        <p className="text-[12px] font-mono text-neutral-400 mb-3">
          Total cost: ${data.total_cost.toFixed(2)}
        </p>
      )}

      {/* Table */}
      <div className="rounded border border-neutral-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-500 text-[12px]">
            Loading...
          </div>
        ) : !data?.logs?.length ? (
          <div className="p-8 text-center text-neutral-500 text-[12px]">
            No logs found
          </div>
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-[#141414]">
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Time
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Org
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  User
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Type
                </th>
                <th className="text-left py-2 px-2 text-neutral-500 font-medium">
                  Model
                </th>
                <th className="text-right py-2 px-2 text-neutral-500 font-medium">
                  In Tokens
                </th>
                <th className="text-right py-2 px-2 text-neutral-500 font-medium">
                  Out Tokens
                </th>
                <th className="text-right py-2 px-2 text-neutral-500 font-medium">
                  Cost
                </th>
                <th className="text-right py-2 px-2 text-neutral-500 font-medium">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
                >
                  <td
                    className="py-1.5 px-2 text-neutral-300"
                    title={row.created_at}
                  >
                    {formatRelative(row.created_at)}
                  </td>
                  <td className="py-1.5 px-2 text-neutral-300 max-w-[120px] truncate">
                    {row.org_name ?? row.org_id ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-neutral-300 max-w-[140px] truncate">
                    {row.user_email ?? "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-700/50 text-neutral-300">
                      {row.call_type}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-neutral-400">
                    {row.model ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-neutral-400">
                    {row.input_tokens ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-neutral-400">
                    {row.output_tokens ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-neutral-400">
                    ${(row.cost_usd ?? 0).toFixed(4)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-neutral-400">
                    {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
                  </td>
                </tr>
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
