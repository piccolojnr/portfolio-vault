"use client";

import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

function timeAgo(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const s = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo ago`;
  return `${Math.floor(s / 31536000)}y ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  disabled: boolean;
  created_at: string;
  org_count: number;
  plan: string | null;
  tokens_used_this_month: number;
  last_active_at: string | null;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

interface Membership {
  org_id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  joined_at: string | null;
}

interface UsageItem {
  call_type: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface UserDetailResponse {
  user: UserRow;
  memberships: Membership[];
  usage_this_month: UsageItem[];
}

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["platform-users", search, plan, status, page],
    queryFn: () =>
      adminFetch<UsersResponse>(
        `/api/platform/users?search=${encodeURIComponent(search)}&plan=${plan === "all" ? "" : plan}&status=${status === "all" ? "" : status}&page=${page}&limit=50`,
      ),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["platform-user-detail", selectedId],
    queryFn: () =>
      adminFetch<UserDetailResponse>(`/api/platform/users/${selectedId}`),
    enabled: !!selectedId,
  });

  const disableMutate = useMutation({
    mutationFn: (id: string) =>
      adminFetch<{ status: string }>(
        `/api/platform/users/${id}/disable`,
        { method: "POST" },
      ),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      qc.invalidateQueries({ queryKey: ["platform-user-detail", id] });
    },
  });

  const enableMutate = useMutation({
    mutationFn: (id: string) =>
      adminFetch<{ status: string }>(
        `/api/platform/users/${id}/enable`,
        { method: "POST" },
      ),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      qc.invalidateQueries({ queryKey: ["platform-user-detail", id] });
    },
  });

  const handleDisable = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      disableMutate.mutate(id);
    },
    [disableMutate],
  );

  const handleEnable = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      enableMutate.mutate(id);
    },
    [enableMutate],
  );

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 50)));

  return (
    <div className="min-h-full bg-[#0f0f0f] text-neutral-200">
      <div className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-[15px] font-semibold">Users</h1>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 w-48 rounded border border-neutral-800 bg-[#141414] px-2.5 text-[12px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          />
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded border border-neutral-800 bg-[#141414] px-2.5 text-[12px] text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded border border-neutral-800 bg-[#141414] px-2.5 text-[12px] text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-[#141414] overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-[12px] text-neutral-500">
              Loading...
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Orgs
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Plan
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Tokens
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Last Active
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Created
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-[12px]">{u.email}</td>
                    <td className="px-4 py-2 text-[12px]">{u.org_count}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-800 text-neutral-300">
                        {u.plan ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]">
                      {formatNumber(u.tokens_used_this_month)}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {timeAgo(u.last_active_at)}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          u.disabled
                            ? "bg-red-500/20 text-red-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {u.disabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {u.disabled ? (
                        <button
                          onClick={(e) => handleEnable(e, u.id)}
                          disabled={enableMutate.isPending}
                          className="text-[11px] text-green-400 hover:text-green-300 disabled:opacity-50"
                        >
                          Enable
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleDisable(e, u.id)}
                          disabled={disableMutate.isPending}
                          className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-[12px] text-neutral-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-neutral-800 px-2.5 py-1 hover:bg-neutral-800/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-neutral-800 px-2.5 py-1 hover:bg-neutral-800/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedId(null)}
          />
          <div className="relative z-10 w-96 flex flex-col bg-[#141414] border-l border-neutral-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <span className="text-[13px] font-medium">User details</span>
              <button
                onClick={() => setSelectedId(null)}
                className="text-neutral-400 hover:text-neutral-200 text-[12px]"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {detailLoading ? (
                <div className="text-[12px] text-neutral-500">Loading...</div>
              ) : detail ? (
                <>
                  <div className="rounded-lg border border-neutral-800 p-3 space-y-1.5">
                    <p className="text-[12px] text-neutral-500">Email</p>
                    <p className="text-[12px]">{detail.user.email}</p>
                    <p className="text-[12px] text-neutral-500">ID</p>
                    <p className="font-mono text-[11px] text-neutral-400 break-all">
                      {detail.user.id}
                    </p>
                    <p className="text-[12px] text-neutral-500">Created</p>
                    <p className="text-[12px]">
                      {formatDate(detail.user.created_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-neutral-400 mb-2">
                      Org memberships
                    </p>
                    <div className="space-y-1.5">
                      {detail.memberships.length === 0 ? (
                        <p className="text-[12px] text-neutral-500">
                          No memberships
                        </p>
                      ) : (
                        detail.memberships.map((m) => (
                          <div
                            key={m.org_id}
                            className="rounded border border-neutral-800 p-2 text-[12px]"
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-neutral-500 ml-1">
                              ({m.slug})
                            </span>
                            <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] bg-neutral-800 ml-1">
                              {m.plan}
                            </span>
                            <span className="text-neutral-500 ml-1">
                              {m.role}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-neutral-400 mb-2">
                      Usage this month
                    </p>
                    <div className="space-y-2">
                      {detail.usage_this_month.length === 0 ? (
                        <p className="text-[12px] text-neutral-500">
                          No usage
                        </p>
                      ) : (
                        detail.usage_this_month.map((u) => {
                          const total =
                            (u.input_tokens || 0) + (u.output_tokens || 0);
                          const maxTotal = Math.max(
                            ...detail.usage_this_month.map(
                              (x) =>
                                (x.input_tokens || 0) + (x.output_tokens || 0),
                            ),
                            1,
                          );
                          const pct = (total / maxTotal) * 100;
                          return (
                            <div key={u.call_type} className="space-y-0.5">
                              <div className="flex justify-between text-[11px]">
                                <span>{u.call_type}</span>
                                <span className="font-mono">
                                  {formatNumber(total)} tokens
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                                <div
                                  className="h-full bg-neutral-600 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    {detail.user.disabled ? (
                      <button
                        onClick={() => enableMutate.mutate(selectedId)}
                        disabled={enableMutate.isPending}
                        className="w-full rounded border border-green-600 bg-green-600/20 py-2 text-[12px] text-green-400 hover:bg-green-600/30 disabled:opacity-50"
                      >
                        Enable user
                      </button>
                    ) : (
                      <button
                        onClick={() => disableMutate.mutate(selectedId)}
                        disabled={disableMutate.isPending}
                        className="w-full rounded border border-red-600 bg-red-600/20 py-2 text-[12px] text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                      >
                        Disable user
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
