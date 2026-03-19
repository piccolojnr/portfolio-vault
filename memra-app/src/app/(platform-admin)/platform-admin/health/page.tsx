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

const COMPONENTS = [
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

function StatusIndicator({ status }: { status: string }) {
  const isOk = status === "ok";
  const isStale = status === "stale";

  const color = isOk
    ? "bg-emerald-500"
    : isStale
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <span
      className={`inline-block size-2 rounded-full shrink-0 ${color}`}
      title={status}
    />
  );
}

function StatusCard({
  label,
  data,
}: {
  label: string;
  data: ComponentHealth | string;
}) {
  const status = typeof data === "string" ? data : data.status;
  const ms = typeof data === "object" ? data.response_ms : 0;

  return (
    <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <StatusIndicator status={status} />
        <span className="text-[13px] font-medium text-neutral-200">{label}</span>
      </div>
      <p className="text-[11px] text-neutral-500 capitalize">{status}</p>
      <p className="text-[11px] font-mono text-neutral-500 mt-0.5">
        {ms > 0 ? `${ms} ms` : "—"}
      </p>
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

  const data = healthQuery.data;
  const degraded = data
    ? COMPONENTS.filter((c) => {
        const d =
          c.key === "api_server"
            ? data.api_server
            : (data as unknown as Record<string, ComponentHealth>)[c.key]?.status;
        return d === "error" || d === "offline";
      })
    : [];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-200 p-6">
      <h1 className="text-lg font-medium text-neutral-200 mb-6">
        System Health
      </h1>

      {healthQuery.isLoading ? (
        <p className="text-neutral-500 text-[12px]">Loading...</p>
      ) : data ? (
        <div className="space-y-4">
          {degraded.length > 0 && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-[13px] text-red-200">
              System degraded —{" "}
              {degraded.map((c) => c.label).join(", ")}{" "}
              {degraded.length === 1 ? "is" : "are"} unavailable
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <StatusCard label="API Server" data={data.api_server} />
            <StatusCard
              label="Database"
              data={data.database}
            />
            <StatusCard label="Qdrant" data={data.qdrant} />
            <StatusCard label="Worker" data={data.worker} />
            <StatusCard label="Email" data={data.email} />
            <StatusCard label="Storage" data={data.storage} />
          </div>

          <div className="flex gap-6 text-[12px] text-neutral-500">
            <span>Uptime: {formatUptime(data.uptime_seconds)}</span>
            <span>Version: {data.version}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
