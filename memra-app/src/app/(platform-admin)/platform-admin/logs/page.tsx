"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

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
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">API Call Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse and export API call history
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase">Type:</span>
          {CALL_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={callTypes.includes(t)}
                onCheckedChange={() => toggleCallType(t)}
              />
              {t}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 text-xs font-mono w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 text-xs font-mono w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Org ID</span>
          <Input
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="optional"
            className="h-7 text-xs font-mono w-40"
          />
        </div>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAutoRefresh((r) => !r)}
        >
          {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        </Button>
      </div>

      {data && (
        <p className="text-sm font-mono text-muted-foreground">
          Total cost: <span className="font-medium text-foreground">${parseFloat(data.total_cost ?? "0").toFixed(2)}</span>
        </p>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !data?.logs?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No logs found
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Time</th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Org</th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">User</th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Type</th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Model</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">In Tokens</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Out Tokens</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Cost</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/50 hover:bg-muted/20"
                >
                  <td className="py-1.5 px-2" title={row.created_at}>
                    {formatRelative(row.created_at)}
                  </td>
                  <td className="py-1.5 px-2 max-w-[120px] truncate">
                    {row.org_name ?? row.org_id ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 max-w-[140px] truncate">
                    {row.user_email ?? "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {row.call_type}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-muted-foreground">
                    {row.model ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                    {row.input_tokens ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                    {row.output_tokens ?? "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                    ${(parseFloat(row.cost_usd ?? "0") ?? 0).toFixed(4)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                    {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
                  </td>
                </tr>
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
