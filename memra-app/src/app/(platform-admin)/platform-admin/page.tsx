"use client";

import { adminFetch } from "@/lib/platform-admin/api";
import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const CALL_TYPE_COLORS: Record<string, string> = {
  chat: "#6366f1",
  embed: "#22c55e",
  classify: "#f59e0b",
  summarise: "#ec4899",
  entity_extract: "#06b6d4",
};

interface OverviewResponse {
  total_users: number;
  total_orgs: number;
  total_cost_today: number;
  total_cost_this_month: number;
  total_api_calls_today: number;
  new_users_today: number;
  new_orgs_today: number;
  active_users_today: number;
}

interface DailyByTypeItem {
  date: string;
  call_type: string;
  calls: number;
  cost_usd: number;
}

interface DailyItem {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface ByOrgItem {
  org_id: string | null;
  org_name: string | null;
  plan: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface Job {
  id: string;
  type: string;
  org_id: string | null;
  org_name?: string | null;
  status: string;
  error?: string | null;
  created_at: string;
}

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      {sub && (
        <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
          {sub}
        </div>
      )}
    </div>
  );
}

function pivotDailyByType(data: DailyByTypeItem[]): Record<string, number | string>[] {
  const byDate = new Map<string, Record<string, number | string>>();
  const callTypes = new Set<string>();

  for (const row of data) {
    callTypes.add(row.call_type);
    const existing = byDate.get(row.date) ?? { date: row.date };
    (existing as Record<string, number>)[row.call_type] = row.calls;
    byDate.set(row.date, existing);
  }

  return Array.from(byDate.values())
    .map((row) => {
      const out: Record<string, number | string> = { date: row.date as string };
      for (const ct of callTypes) {
        out[ct] = (row[ct] as number) ?? 0;
      }
      return out;
    })
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function PlatformAdminDashboardPage() {
  const overview = useQuery({
    queryKey: ["platform", "analytics", "overview"],
    queryFn: () => adminFetch<OverviewResponse>("/api/platform/analytics/overview"),
  });

  const dailyByType = useQuery({
    queryKey: ["platform", "analytics", "daily-by-type", 30],
    queryFn: () =>
      adminFetch<DailyByTypeItem[]>("/api/platform/analytics/daily-by-type?days=30"),
  });

  const daily = useQuery({
    queryKey: ["platform", "analytics", "daily", 30],
    queryFn: () =>
      adminFetch<DailyItem[]>("/api/platform/analytics/daily?days=30"),
  });

  const byOrg = useQuery({
    queryKey: ["platform", "analytics", "by-org", 30],
    queryFn: () =>
      adminFetch<ByOrgItem[]>("/api/platform/analytics/by-org?days=30"),
  });

  const failedJobs = useQuery({
    queryKey: ["platform", "jobs", "failed"],
    queryFn: () =>
      adminFetch<JobsResponse>("/api/platform/jobs?status=failed&limit=10"),
  });

  const stackedData = dailyByType.data ? pivotDailyByType(dailyByType.data) : [];
  const callTypes = Array.from(
    new Set((dailyByType.data ?? []).map((r) => r.call_type).filter(Boolean))
  ).sort();

  const topOrgs = (byOrg.data ?? []).slice(0, 5);
  const jobs = failedJobs.data?.jobs ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Platform overview and analytics
          </p>
        </div>

        {overview.isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface/40" />
            ))}
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard
                label="Total Users"
                value={String(overview.data?.total_users ?? 0)}
                sub={`+${overview.data?.new_users_today ?? 0} today`}
              />
              <StatCard
                label="Total Orgs"
                value={String(overview.data?.total_orgs ?? 0)}
                sub={`+${overview.data?.new_orgs_today ?? 0} today`}
              />
              <StatCard
                label="API Cost Today"
                value={`$${(overview.data?.total_cost_today ?? 0).toFixed(2)}`}
                sub={`${overview.data?.total_api_calls_today ?? 0} calls`}
              />
              <StatCard
                label="API Cost This Month"
                value={`$${(overview.data?.total_cost_this_month ?? 0).toFixed(2)}`}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Daily API calls — last 30 days
                </p>
                <div className="h-[220px]">
                  {dailyByType.isLoading ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/50">
                      Loading…
                    </div>
                  ) : stackedData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/50">
                      No data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stackedData} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tickFormatter={formatDate} stroke="#52525b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1e1e22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                          labelFormatter={(label: ReactNode) => formatDate(label as string)}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {callTypes.map((ct) => (
                          <Bar key={ct} dataKey={ct} stackId="a" fill={CALL_TYPE_COLORS[ct] ?? "#71717a"} name={ct} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Daily cost — last 30 days
                </p>
                <div className="h-[220px]">
                  {daily.isLoading ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/50">
                      Loading…
                    </div>
                  ) : !daily.data?.length ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/50">
                      No data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={daily.data} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tickFormatter={formatDate} stroke="#52525b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1e1e22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                          labelFormatter={(label: ReactNode) => formatDate(label as string)}
                          formatter={(v: any) => [`$${v?.toFixed(2) ?? 0}`, "Cost"]}
                        />
                        <Line type="monotone" dataKey="cost_usd" stroke="#6366f1" strokeWidth={2} dot={{ r: 2, fill: "#6366f1" }} name="Cost ($)" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Tables */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Top Orgs by Cost
                </p>
                {byOrg.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-8 rounded-lg bg-surface/40 animate-pulse" />
                    ))}
                  </div>
                ) : topOrgs.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 py-4">No data</p>
                ) : (
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead className="border-b border-border/40 bg-muted/10">
                        <tr>
                          {["Org Name", "Plan", "Cost ($)", "Calls"].map((h) => (
                            <th key={h} className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {topOrgs.map((row) => (
                          <tr key={row.org_id ?? row.org_name ?? "unknown"} className="border-t border-border/20 hover:bg-surface/30 transition-colors">
                            <td className="px-3 py-2 text-[12px] font-mono">{row.org_name ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px] font-mono text-muted-foreground">{row.plan ?? "—"}</td>
                            <td className="px-3 py-2 text-[12px] font-mono text-foreground font-medium">{row.cost_usd.toFixed(2)}</td>
                            <td className="px-3 py-2 text-[12px] font-mono text-muted-foreground">{row.calls}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/40 bg-surface/30 p-4">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Recent Failed Jobs
                </p>
                {failedJobs.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-8 rounded-lg bg-surface/40 animate-pulse" />
                    ))}
                  </div>
                ) : jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 py-4">No failed jobs</p>
                ) : (
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead className="border-b border-border/40 bg-muted/10">
                        <tr>
                          {["Type", "Org", "Error", "Created"].map((h) => (
                            <th key={h} className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr key={job.id} className="border-t border-border/20 hover:bg-surface/30 transition-colors">
                            <td className="px-3 py-2 text-[12px] font-mono">{job.type}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground">{job.org_name ?? "—"}</td>
                            <td className="px-3 py-2 text-[11px] text-red-400/80 max-w-[140px] truncate" title={job.error ?? undefined}>
                              {job.error ? (job.error.length > 30 ? job.error.slice(0, 30) + "…" : job.error) : "—"}
                            </td>
                            <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                              {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
