"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

interface ComponentHealth {
  status: string;
  response_ms: number;
  detail?: string | null;
}

interface HealthResponse {
  api_server: string;
  database: ComponentHealth;
  qdrant: ComponentHealth;
  worker: ComponentHealth;
  email: ComponentHealth;
  storage: ComponentHealth;
  paystack: ComponentHealth;
  neo4j: ComponentHealth;
  uptime_seconds: number;
  version: string;
}

interface FrontendHealth {
  status: string;
  timestamp: string;
  runtime: string;
}

const COMPONENTS = [
  { key: "frontend", label: "Frontend" },
  { key: "api_server", label: "API Server" },
  { key: "database", label: "Database" },
  { key: "qdrant", label: "Qdrant" },
  { key: "worker", label: "Worker" },
  { key: "email", label: "Email" },
  { key: "paystack", label: "Paystack" },
  { key: "neo4j", label: "Neo4j" },
  { key: "storage", label: "Storage" },
] as const;

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function statusToCardTone(status: string) {
  const isOk = status === "ok";
  const isStale = status === "stale";
  const isError = status === "error" || status === "offline";

  if (isError) return "error";
  if (isStale) return "stale";
  if (isOk) return "ok";
  return "unknown";
}

function StatusCard({
  label,
  status,
  ms,
  detail,
}: {
  label: string;
  status: string;
  ms: number;
  detail?: string;
}) {
  const tone = statusToCardTone(status);

  const borderColor = tone === "error"
    ? "border-red-500/30 bg-red-500/5"
    : tone === "stale"
      ? "border-yellow-500/30 bg-yellow-500/5"
      : "border-border/40 bg-surface/30";

  const dotColor = tone === "ok"
    ? "text-green-400"
    : tone === "stale"
      ? "text-yellow-400"
      : tone === "error"
        ? "text-red-400"
        : "text-muted-foreground/70";

  return (
    <div className={`px-4 py-3 rounded-xl border ${borderColor}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-mono text-foreground">{label}</span>
        <span className={`text-[10px] font-mono ${dotColor}`}>
          {tone === "ok"
            ? "●"
            : tone === "stale"
              ? "◐"
              : tone === "error"
                ? "○"
                : "?"}{" "}
          {status}
        </span>
      </div>
      <div className="text-[11px] font-mono text-muted-foreground mt-1">
        {ms > 0 ? `${ms}ms` : "—"}
      </div>
      {detail && (
        <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono wrap-break-word whitespace-pre-wrap">
          {detail}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const healthQuery = useQuery({
    queryKey: ["platform", "health", "detailed"],
    queryFn: () =>
      adminFetch<HealthResponse>("/api/platform/health/detailed"),
    refetchInterval: 30000,
  });

  const frontendQuery = useQuery({
    queryKey: ["platform", "health", "frontend"],
    queryFn: async () => {
      const start = performance.now();
      const res = await fetch("/api/platform/health/frontend");
      const elapsed = Math.round(performance.now() - start);
      const data: FrontendHealth = await res.json();
      return { ...data, response_ms: elapsed };
    },
    refetchInterval: 30000,
  });

  const data = healthQuery.data;
  const frontend = frontendQuery.data;
  const getStatus = (key: string): string => {
    if (key === "frontend") return frontend?.status ?? "unknown";
    if (!data) return "unknown";
    if (key === "api_server") return data.api_server;
    return (data as unknown as Record<string, ComponentHealth>)[key]?.status ?? "unknown";
  };

  const getMs = (key: string): number => {
    if (key === "frontend") return frontend?.response_ms ?? 0;
    if (!data) return 0;
    if (key === "api_server") return 0;
    return (data as unknown as Record<string, ComponentHealth>)[key]?.response_ms ?? 0;
  };

  const getDetail = (key: string): string | undefined => {
    if (key === "frontend") return frontend?.runtime;
    if (key === "api_server") return undefined;
    const d = (data as unknown as Record<string, ComponentHealth>)[key]?.detail;
    return d ? String(d) : undefined;
  };

  const degraded = COMPONENTS.filter((c) => {
    const s = getStatus(c.key);
    return s === "error" || s === "offline";
  });

  const stale = COMPONENTS.filter((c) => {
    const s = getStatus(c.key);
    return s === "stale";
  });

  const allHealthy = degraded.length === 0 && stale.length === 0 && data && frontend;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              System Health
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Real-time status of all system components
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
              <span>uptime: {formatUptime(data.uptime_seconds)}</span>
              <span>version: {data.version}</span>
              {frontend?.runtime && (
                <span>runtime: {frontend.runtime}</span>
              )}
            </div>
          )}
        </div>

        {healthQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: COMPONENTS.length }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface/40" />
            ))}
          </div>
        ) : (
          <>
            {degraded.length > 0 && (
              <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <span className="text-red-400 mt-0.5 shrink-0">!</span>
                <div>
                  <p className="text-sm font-medium text-red-300">
                    System degraded
                  </p>
                  <p className="text-[11px] text-red-300/70 mt-0.5">
                    {degraded.map((c) => c.label).join(", ")}{" "}
                    {degraded.length === 1 ? "is" : "are"} unavailable.
                  </p>
                </div>
              </div>
            )}

            {stale.length > 0 && degraded.length === 0 && (
              <div className="flex items-start gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <span className="text-yellow-400 mt-0.5 shrink-0">◐</span>
                <div>
                  <p className="text-sm font-medium text-yellow-200">
                    Some components are stale
                  </p>
                  <p className="text-[11px] text-yellow-200/70 mt-0.5">
                    {stale.map((c) => c.label).join(", ")}{" "}
                    {stale.length === 1 ? "needs" : "need"} attention.
                  </p>
                </div>
              </div>
            )}

            {allHealthy && degraded.length === 0 && stale.length === 0 && (
              <div className="flex items-start gap-3 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                <span className="text-green-400 mt-0.5 shrink-0">●</span>
                <p className="text-sm text-green-300">All systems operational</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {COMPONENTS.map((c) => (
                <StatusCard
                  key={c.key}
                  label={c.label}
                  status={getStatus(c.key)}
                  ms={getMs(c.key)}
                  detail={
                    getDetail(c.key)
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
