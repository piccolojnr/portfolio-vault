"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface AuditLogRow {
  id: string;
  admin_id: string;
  admin_email: string;
  admin_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface AuditLogsResponse {
  items: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

interface AuditLogDetailResponse {
  item: AuditLogRow;
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function buildAuditUrl(params: {
  q: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}): string {
  const sp = new URLSearchParams();
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.adminId.trim()) sp.set("admin_id", params.adminId.trim());
  if (params.action.trim()) sp.set("action", params.action.trim());
  if (params.targetType.trim()) sp.set("target_type", params.targetType.trim());
  if (params.targetId.trim()) sp.set("target_id", params.targetId.trim());
  if (params.from) sp.set("from", new Date(params.from).toISOString());
  if (params.to) sp.set("to", new Date(params.to).toISOString());
  sp.set("page", String(params.page));
  sp.set("limit", String(params.limit));
  return `/api/platform/audit?${sp.toString()}`;
}

export default function PlatformAdminAuditPage() {
  const now = useMemo(() => new Date(), []);
  const weekAgo = useMemo(
    () => new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    [now],
  );

  const [q, setQ] = useState("");
  const [adminId, setAdminId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState(weekAgo.toISOString().slice(0, 16));
  const [to, setTo] = useState(now.toISOString().slice(0, 16));
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listUrl = buildAuditUrl({
    q,
    adminId,
    action,
    targetType,
    targetId,
    from,
    to,
    page,
    limit: 50,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "audit", listUrl],
    queryFn: () => adminFetch<AuditLogsResponse>(listUrl),
  });

  const detailUrl = selectedId ? `/api/platform/audit/${selectedId}` : "";
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["platform", "audit-detail", selectedId],
    queryFn: () => adminFetch<AuditLogDetailResponse>(detailUrl),
    enabled: !!selectedId,
  });

  const handleExportCsv = useCallback(() => {
    const rows = data?.items ?? [];
    const headers = [
      "id",
      "created_at",
      "admin_id",
      "admin_email",
      "admin_name",
      "action",
      "target_type",
      "target_id",
      "ip_address",
      "metadata",
    ];
    const escape = (v: unknown) => {
      const str = String(v ?? "");
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    const csv =
      `${headers.join(",")}\n` +
      rows
        .map((row) =>
          headers
            .map((header) => {
              if (header === "metadata") {
                return escape(JSON.stringify(row.metadata ?? {}));
              }
              return escape((row as unknown as Record<string, unknown>)[header]);
            })
            .join(","),
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data?.items]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Admin Audit
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Track admin actions across users, organisations, plans, and settings
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
            <div className="text-lg font-mono font-semibold text-foreground">
              {total}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Matching Events
            </div>
          </div>
          <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
            <div className="text-lg font-mono font-semibold text-foreground">
              {items.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Current Page Rows
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search action/admin/target..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono w-[260px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            placeholder="Admin ID"
            value={adminId}
            onChange={(e) => {
              setAdminId(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono w-[220px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            placeholder="Action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono w-[160px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            placeholder="Target Type"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono w-[140px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="text"
            placeholder="Target ID"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono w-[220px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="rounded-xl border border-border/60 overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-surface/40 animate-pulse"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/10 border-b border-border/40">
                <tr>
                  {[
                    "Time",
                    "Admin",
                    "Action",
                    "Target",
                    "IP",
                    "Metadata",
                    "Details",
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
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-[11px] font-mono" title={row.created_at}>
                      {formatRelative(row.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono max-w-[220px] truncate">
                      {row.admin_email}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono">
                      {row.action}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono max-w-[200px] truncate">
                      {row.target_type ?? "—"}
                      {row.target_id ? `:${row.target_id}` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {row.ip_address ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono max-w-[280px] truncate text-muted-foreground">
                      {JSON.stringify(row.metadata ?? {})}
                    </td>
                    <td className="px-3 py-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSelectedId(row.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center gap-2 justify-center py-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Prev
          </button>
          <span className="text-[11px] font-mono text-muted-foreground/50">
            Page {page} of {totalPages} ({total} events)
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-[460px] sm:max-w-[460px] overflow-auto">
          <SheetHeader>
            <SheetTitle>Audit Event</SheetTitle>
            <SheetDescription>
              {detail?.item?.action ?? "Loading event details"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4 px-4 pb-4">
            {detailLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-md bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : detail?.item ? (
              <>
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Event ID</p>
                    <p className="text-xs font-mono break-all">{detail.item.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-mono">{formatDateTime(detail.item.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Admin</p>
                    <p className="text-sm font-mono">{detail.item.admin_name}</p>
                    <p className="text-xs text-muted-foreground">{detail.item.admin_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Action</p>
                    <p className="text-sm font-mono">{detail.item.action}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target</p>
                    <p className="text-sm font-mono">
                      {detail.item.target_type ?? "—"}
                      {detail.item.target_id ? `:${detail.item.target_id}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IP Address</p>
                    <p className="text-sm font-mono">{detail.item.ip_address ?? "—"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Metadata</p>
                  <pre className="rounded-lg border border-border p-3 text-xs font-mono overflow-x-auto bg-muted/10">
                    {JSON.stringify(detail.item.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No detail available</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
