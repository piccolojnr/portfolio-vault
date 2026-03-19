"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30 ">
      <div className="text-lg font-mono font-semibold text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
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

const PLAN_OPTIONS = ["all", "free", "pro", "enterprise"] as const;
const SORT_OPTIONS = [
  { value: "cost", label: "Cost" },
  { value: "members", label: "Members" },
  { value: "created", label: "Created" },
] as const;

export default function OrgsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState("cost");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

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
      setPendingPlan(null);
    },
  });

  const orgs = data?.orgs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 50)));

  const visibleCost = orgs.reduce(
    (sum, o) => sum + (parseFloat(o.cost_usd_this_month) ?? 0),
    0,
  );
  const visibleTokens = orgs.reduce(
    (sum, o) => sum + (o.tokens_used_this_month ?? 0),
    0,
  );
  const visibleMembers = orgs.reduce((sum, o) => sum + (o.member_count ?? 0), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Organisations
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            View and manage organisations, plans, and usage
          </p>
        </div>

        {/* StatCards */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-surface/40"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total Orgs" value={String(total)} />
            <StatCard
              label="Visible Cost (This Month)"
              value={`$${visibleCost.toFixed(2)}`}
            />
            <StatCard
              label="Visible Tokens"
              value={formatNumber(visibleTokens)}
            />
            <StatCard label="Visible Members" value={String(visibleMembers)} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 w-56"
          />
          <div className="flex items-center gap-1">
            {PLAN_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlan(p);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-[12px] font-mono ${
                  plan === p
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setSort(s.value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-[12px] font-mono ${
                  sort === s.value
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-surface/40 animate-pulse"
                />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground/50 py-4 text-center">
              No organisations found
            </p>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/10">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Plan
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Members
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Corpora
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Tokens
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Cost
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="border-t border-border/20 hover:bg-surface/30 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      <span className="text-foreground">{o.name}</span>
                      <span className="text-muted-foreground ml-1">
                        ({o.slug})
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          o.plan === "enterprise"
                            ? "bg-primary/20 text-primary"
                            : o.plan === "pro"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {o.plan}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {o.member_count}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {o.corpus_count}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {formatNumber(o.tokens_used_this_month ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      ${(parseFloat(o.cost_usd_this_month) ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-muted-foreground">
                      {formatDate(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2 justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </Button>
          <span className="text-[12px] font-mono text-muted-foreground">
            Page {page} of {totalPages} ({total} orgs)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      <Sheet
        open={!!selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <SheetContent
          side="right"
          className="w-[400px] sm:max-w-[400px] overflow-auto"
        >
          <SheetHeader>
            <SheetTitle>Organisation Details</SheetTitle>
            <SheetDescription>
              {detail?.org?.name ?? "Loading..."}
            </SheetDescription>
            {detail?.org?.id ? (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/orgs/${detail.org.id}`)}
                >
                  View details
                </Button>
              </div>
            ) : null}
          </SheetHeader>
          <div className="space-y-5 mt-4 px-4 pb-4">
            {detailLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-surface/40"
                  />
                ))}
              </div>
            ) : detail ? (
              <>
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm">{detail.org.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Slug</p>
                    <p className="font-mono text-sm">{detail.org.slug}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {detail.org.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{formatDate(detail.org.created_at)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Members
                  </p>
                  <div className="space-y-1.5">
                    {detail.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No members
                      </p>
                    ) : (
                      detail.members.map((m) => (
                        <div
                          key={m.user_id}
                          className="rounded-lg border border-border p-2.5 text-sm"
                        >
                          <span className="font-medium">{m.email}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ml-1.5 bg-muted/50 text-muted-foreground`}
                          >
                            {m.role}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Usage This Month
                  </p>
                  <div className="space-y-2">
                    {detail.usage_this_month.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No usage
                      </p>
                    ) : (
                      detail.usage_this_month.map((u) => {
                        const total = (u.input_tokens || 0) + (u.output_tokens || 0);
                        const maxTotal = Math.max(
                          ...detail.usage_this_month.map(
                            (x) =>
                              (x.input_tokens || 0) + (x.output_tokens || 0),
                          ),
                          1,
                        );
                        const pct = (total / maxTotal) * 100;
                        return (
                          <div key={u.call_type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{u.call_type}</span>
                              <span className="font-mono text-muted-foreground">
                                {formatNumber(total)} tokens
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
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
                  <p className="text-sm font-medium text-foreground mb-2">
                    Change Plan
                  </p>
                  <Select
                    value={detail.org.plan}
                    onValueChange={(v) => {
                      if (v && v !== detail.org.plan) {
                        setPendingPlan(v);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pendingPlan && pendingPlan !== detail.org.plan && (
                  <AlertDialog
                    open
                    onOpenChange={(open) => !open && setPendingPlan(null)}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Change organisation plan?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will change{" "}
                          <strong>{detail.org.name}</strong>&apos;s plan from{" "}
                          <strong>{detail.org.plan}</strong> to{" "}
                          <strong>{pendingPlan}</strong>. This may affect
                          feature access and billing for all members.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingPlan(null)}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            planMutate.mutate({
                              id: selectedId!,
                              plan: pendingPlan,
                            });
                          }}
                        >
                          Change Plan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
