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

function truncate(str: string, len: number): string {
  if (!str) return "—";
  return str.length <= len ? str : str.slice(0, len) + "…";
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
      adminFetch<JobsResponse>(
        "/api/platform/jobs?status=failed&limit=10"
      ),
  });

  const stackedData = dailyByType.data ? pivotDailyByType(dailyByType.data) : [];
  const callTypes = Array.from(
    new Set(
      (dailyByType.data ?? []).map((r) => r.call_type).filter(Boolean)
    )
  ).sort();

  const topOrgs = (byOrg.data ?? []).slice(0, 5);
  const jobs = failedJobs.data?.jobs ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform overview and analytics
        </p>
      </div>

      {overview.isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: overview.data?.total_users ?? 0 },
              { label: "Total Orgs", value: overview.data?.total_orgs ?? 0 },
              { label: "API Cost Today ($)", value: (overview.data?.total_cost_today ?? 0).toFixed(2) },
              { label: "API Cost This Month ($)", value: (overview.data?.total_cost_this_month ?? 0).toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {label}
                </p>
                <p className="text-2xl font-mono text-card-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Daily API calls last 30 days
              </p>
              <div className="h-[240px]">
                {dailyByType.isLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : stackedData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stackedData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                          color: "hsl(var(--card-foreground))",
                        }}
                        labelFormatter={(label: ReactNode) => formatDate(label as string)}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {callTypes.map((ct) => (
                        <Bar
                          key={ct}
                          dataKey={ct}
                          stackId="a"
                          fill={CALL_TYPE_COLORS[ct] ?? "#71717a"}
                          name={ct}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Daily cost last 30 days
              </p>
              <div className="h-[240px]">
                {daily.isLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : !daily.data?.length ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily.data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                          color: "hsl(var(--card-foreground))",
                        }}
                        labelFormatter={(label: ReactNode) => formatDate(label as string)}
                        formatter={(v: any) => [`$${v?.toFixed(2) ?? 0}`, "Cost"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="cost_usd"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 2, fill: "#6366f1" }}
                        name="Cost ($)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Top Orgs by Cost
              </p>
              <div className="overflow-x-auto">
                {byOrg.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : topOrgs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                          Org Name
                        </th>
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                          Plan
                        </th>
                        <th className="text-right py-2 pr-4 text-muted-foreground font-medium">
                          Cost ($)
                        </th>
                        <th className="text-right py-2 text-muted-foreground font-medium">
                          Calls
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOrgs.map((row) => (
                        <tr
                          key={row.org_id ?? row.org_name ?? "unknown"}
                          className="border-b border-border/50"
                        >
                          <td className="py-2 pr-4">{row.org_name ?? "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground font-mono">
                            {row.plan ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {row.cost_usd.toFixed(2)}
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground">
                            {row.calls}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Recent Failed Jobs
              </p>
              <div className="overflow-x-auto">
                {failedJobs.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failed jobs</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                          Type
                        </th>
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                          Org
                        </th>
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                          Error
                        </th>
                        <th className="text-left py-2 text-muted-foreground font-medium">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b border-border/50"
                        >
                          <td className="py-2 pr-4 font-mono">{job.type}</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {job.org_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground max-w-[140px] truncate" title={job.error ?? undefined}>
                            {truncate(job.error ?? "—", 24)}
                          </td>
                          <td className="py-2 text-muted-foreground font-mono text-[11px]">
                            {job.created_at
                              ? new Date(job.created_at).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
