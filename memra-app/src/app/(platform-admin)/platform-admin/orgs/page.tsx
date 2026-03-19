"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

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

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  member_count: number;
  corpus_count: number;
  tokens_used_this_month: number;
  cost_usd_this_month: string;
}

interface OrgsResponse {
  orgs: OrgRow[];
  total: number;
  page: number;
  limit: number;
}

interface OrgMember {
  user_id: string;
  email: string;
  display_name: string | null;
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

interface OrgDetailResponse {
  org: OrgRow;
  members: OrgMember[];
  usage_this_month: UsageItem[];
}

export default function OrgsPage() {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState("cost");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["platform-orgs", search, plan, sort, page],
    queryFn: () =>
      adminFetch<OrgsResponse>(
        `/api/platform/orgs?search=${encodeURIComponent(search)}&plan=${plan === "all" ? "" : plan}&sort=${sort}&page=${page}&limit=50`,
      ),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["platform-org-detail", selectedId],
    queryFn: () =>
      adminFetch<OrgDetailResponse>(`/api/platform/orgs/${selectedId}`),
    enabled: !!selectedId,
  });

  const planMutate = useMutation({
    mutationFn: ({
      id,
      plan: newPlan,
    }: {
      id: string;
      plan: string;
    }) =>
      adminFetch<{ status: string; plan: string }>(
        `/api/platform/orgs/${id}/plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: newPlan }),
        },
      ),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["platform-orgs"] });
      qc.invalidateQueries({ queryKey: ["platform-org-detail", id] });
    },
  });

  const orgs = data?.orgs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 50)));

  return (
    <div className="min-h-full bg-[#0f0f0f] text-neutral-200">
      <div className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-[15px] font-semibold">Organisations</h1>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search"
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
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded border border-neutral-800 bg-[#141414] px-2.5 text-[12px] text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          >
            <option value="cost">Sort by cost</option>
            <option value="members">Sort by members</option>
            <option value="created">Sort by created</option>
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
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Plan
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Members
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Corpora
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Tokens
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Cost
                  </th>
                  <th className="px-4 py-2.5 text-left text-[13px] font-medium text-neutral-400">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-[12px]">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-neutral-500 ml-1">({o.slug})</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-800 text-neutral-300">
                        {o.plan}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[12px]">{o.member_count}</td>
                    <td className="px-4 py-2 text-[12px]">{o.corpus_count}</td>
                    <td className="px-4 py-2 font-mono text-[12px]">
                      {formatNumber(o.tokens_used_this_month ?? 0)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]">
                      ${(parseFloat(o.cost_usd_this_month) ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {formatDate(o.created_at)}
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
              <span className="text-[13px] font-medium">Org details</span>
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
                    <p className="text-[12px] text-neutral-500">Name</p>
                    <p className="text-[12px]">{detail.org.name}</p>
                    <p className="text-[12px] text-neutral-500">Slug</p>
                    <p className="font-mono text-[12px]">{detail.org.slug}</p>
                    <p className="text-[12px] text-neutral-500">ID</p>
                    <p className="font-mono text-[11px] text-neutral-400 break-all">
                      {detail.org.id}
                    </p>
                    <p className="text-[12px] text-neutral-500">Created</p>
                    <p className="text-[12px]">
                      {formatDate(detail.org.created_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-neutral-400 mb-2">
                      Members
                    </p>
                    <div className="space-y-1.5">
                      {detail.members.length === 0 ? (
                        <p className="text-[12px] text-neutral-500">
                          No members
                        </p>
                      ) : (
                        detail.members.map((m) => (
                          <div
                            key={m.user_id}
                            className="rounded border border-neutral-800 p-2 text-[12px]"
                          >
                            <span className="font-medium">{m.email}</span>
                            <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] bg-neutral-800 ml-1">
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

                  <div>
                    <p className="text-[12px] font-medium text-neutral-400 mb-2">
                      Change plan
                    </p>
                    <select
                      value={detail.org.plan}
                      onChange={(e) => {
                        const newPlan = e.target.value;
                        if (newPlan !== detail.org.plan) {
                          planMutate.mutate({ id: selectedId, plan: newPlan });
                        }
                      }}
                      disabled={planMutate.isPending}
                      className="w-full h-8 rounded border border-neutral-800 bg-[#0f0f0f] px-2.5 text-[12px] text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
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
