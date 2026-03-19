"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Database,
  HardDrive,
  Cpu,
  Mail,
  Cloud,
  Globe,
} from "lucide-react";

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
  { key: "frontend", label: "Frontend", icon: Globe },
  { key: "api_server", label: "API Server", icon: Activity },
  { key: "database", label: "Database", icon: Database },
  { key: "qdrant", label: "Qdrant", icon: Cpu },
  { key: "worker", label: "Worker", icon: HardDrive },
  { key: "email", label: "Email", icon: Mail },
  { key: "storage", label: "Storage", icon: Cloud },
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

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "ok"
      ? "default"
      : status === "stale"
        ? "secondary"
        : "destructive";

  return (
    <Badge variant={variant} className="text-[10px] font-mono capitalize">
      {status}
    </Badge>
  );
}

function StatusCard({
  label,
  icon: Icon,
  status,
  ms,
  detail,
}: {
  label: string;
  icon: React.ElementType;
  status: string;
  ms: number;
  detail?: string;
}) {
  const dotColor =
    status === "ok"
      ? "bg-emerald-500"
      : status === "stale"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-card-foreground">{label}</span>
        </div>
        <span className={`inline-block size-2.5 rounded-full shrink-0 ${dotColor}`} />
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={status} />
        <span className="text-xs font-mono text-muted-foreground">
          {ms > 0 ? `${ms}ms` : "—"}
        </span>
      </div>
      {detail && (
        <p className="text-[11px] text-muted-foreground mt-2">{detail}</p>
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">System Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time status of all system components
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Uptime: <span className="font-mono">{formatUptime(data.uptime_seconds)}</span></span>
            <span>Version: <span className="font-mono">{data.version}</span></span>
            {frontend?.runtime && (
              <span>Runtime: <span className="font-mono capitalize">{frontend.runtime}</span></span>
            )}
          </div>
        )}
      </div>

      {healthQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted/20" />
          ))}
        </div>
      ) : (
        <>
          {degraded.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              System degraded — {degraded.map((c) => c.label).join(", ")}{" "}
              {degraded.length === 1 ? "is" : "are"} unavailable
            </div>
          )}

          {allHealthy && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
              All systems operational
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COMPONENTS.map((c) => (
              <StatusCard
                key={c.key}
                label={c.label}
                icon={c.icon}
                status={getStatus(c.key)}
                ms={getMs(c.key)}
                detail={
                  c.key === "frontend" && frontend?.runtime
                    ? `Running on ${frontend.runtime}`
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
