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
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-200 p-6">
      <h1 className="text-lg font-medium text-neutral-200 mb-6">Dashboard</h1>

      {overview.isLoading ? (
        <p className="text-neutral-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                Total Users
              </p>
              <p className="text-2xl font-mono text-neutral-200">
                {overview.data?.total_users ?? 0}
              </p>
            </div>
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                Total Orgs
              </p>
              <p className="text-2xl font-mono text-neutral-200">
                {overview.data?.total_orgs ?? 0}
              </p>
            </div>
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                API Cost Today ($)
              </p>
              <p className="text-2xl font-mono text-neutral-200">
                {(overview.data?.total_cost_today ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1">
                API Cost This Month ($)
              </p>
              <p className="text-2xl font-mono text-neutral-200">
                {(overview.data?.total_cost_this_month ?? 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[12px] text-neutral-400 mb-3">
                Daily API calls last 30 days
              </p>
              <div className="h-[240px]">
                {dailyByType.isLoading ? (
                  <div className="flex h-full items-center justify-center text-neutral-500 text-[12px]">
                    Loading...
                  </div>
                ) : stackedData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-neutral-500 text-[12px]">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stackedData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        stroke="#52525b"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #27272a",
                          borderRadius: 4,
                          fontSize: 11,
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

            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[12px] text-neutral-400 mb-3">
                Daily cost last 30 days
              </p>
              <div className="h-[240px]">
                {daily.isLoading ? (
                  <div className="flex h-full items-center justify-center text-neutral-500 text-[12px]">
                    Loading...
                  </div>
                ) : !daily.data?.length ? (
                  <div className="flex h-full items-center justify-center text-neutral-500 text-[12px]">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily.data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        stroke="#52525b"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis stroke="#52525b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #27272a",
                          borderRadius: 4,
                          fontSize: 11,
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
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[12px] text-neutral-400 mb-3">
                Top Orgs by Cost
              </p>
              <div className="overflow-x-auto">
                {byOrg.isLoading ? (
                  <p className="text-neutral-500 text-[12px]">Loading...</p>
                ) : topOrgs.length === 0 ? (
                  <p className="text-neutral-500 text-[12px]">No data</p>
                ) : (
                  <table className="w-full text-[12px] border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800">
                        <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                          Org Name
                        </th>
                        <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                          Plan
                        </th>
                        <th className="text-right py-2 pr-4 text-neutral-500 font-medium">
                          Cost ($)
                        </th>
                        <th className="text-right py-2 text-neutral-500 font-medium">
                          Calls
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOrgs.map((row) => (
                        <tr
                          key={row.org_id ?? row.org_name ?? "unknown"}
                          className="border-b border-neutral-800/50"
                        >
                          <td className="py-2 pr-4 text-neutral-200">
                            {row.org_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-neutral-400 font-mono">
                            {row.plan ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-neutral-200">
                            {row.cost_usd.toFixed(2)}
                          </td>
                          <td className="py-2 text-right font-mono text-neutral-400">
                            {row.calls}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
              <p className="text-[12px] text-neutral-400 mb-3">
                Recent Failed Jobs
              </p>
              <div className="overflow-x-auto">
                {failedJobs.isLoading ? (
                  <p className="text-neutral-500 text-[12px]">Loading...</p>
                ) : jobs.length === 0 ? (
                  <p className="text-neutral-500 text-[12px]">No failed jobs</p>
                ) : (
                  <table className="w-full text-[12px] border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800">
                        <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                          Type
                        </th>
                        <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                          Org
                        </th>
                        <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                          Error
                        </th>
                        <th className="text-left py-2 text-neutral-500 font-medium">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b border-neutral-800/50"
                        >
                          <td className="py-2 pr-4 text-neutral-200 font-mono">
                            {job.type}
                          </td>
                          <td className="py-2 pr-4 text-neutral-400">
                            {job.org_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-neutral-400 max-w-[140px] truncate" title={job.error ?? undefined}>
                            {truncate(job.error ?? "—", 24)}
                          </td>
                          <td className="py-2 text-neutral-500 font-mono text-[11px]">
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
