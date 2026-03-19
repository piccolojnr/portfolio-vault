"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

interface ComponentHealth {
  status: string;
  response_ms: number;
}

interface HealthResponse {
  api_server: string;
  database: ComponentHealth;
  qdrant: ComponentHealth;
  worker: ComponentHealth;
  email: ComponentHealth;
  storage: ComponentHealth;
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
  const isOk = status === "ok";
  const isStale = status === "stale";
  const isError = status === "error" || status === "offline";

  const borderColor = isError
    ? "border-red-500/30 bg-red-500/5"
    : isStale
      ? "border-yellow-500/30 bg-yellow-500/5"
      : "border-border/40 bg-surface/30";

  const dotColor = isOk
    ? "text-green-400"
    : isStale
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className={`px-4 py-3 rounded-xl border ${borderColor}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-mono text-foreground">{label}</span>
        <span className={`text-[10px] font-mono ${dotColor}`}>
          {isOk ? "●" : isStale ? "◐" : "○"} {status}
        </span>
      </div>
      <div className="text-[11px] font-mono text-muted-foreground mt-1">
        {ms > 0 ? `${ms}ms` : "—"}
      </div>
      {detail && (
        <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
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

  const degraded = COMPONENTS.filter((c) => {
    const s = getStatus(c.key);
    return s === "error" || s === "offline";
  });

  const allHealthy = degraded.length === 0 && data && frontend;

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
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

            {allHealthy && (
              <div className="flex items-start gap-3 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                <span className="text-green-400 mt-0.5 shrink-0">●</span>
                <p className="text-sm text-green-300">All systems operational</p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              {COMPONENTS.map((c) => (
                <StatusCard
                  key={c.key}
                  label={c.label}
                  status={getStatus(c.key)}
                  ms={getMs(c.key)}
                  detail={
                    c.key === "frontend" && frontend?.runtime
                      ? frontend.runtime
                      : undefined
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
