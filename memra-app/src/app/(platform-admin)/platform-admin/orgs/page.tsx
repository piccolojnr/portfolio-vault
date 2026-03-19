"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Organisations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View and manage organisations, plans, and usage
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 w-56"
          />
          <Select value={plan} onValueChange={(v) => { setPlan(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="h-8 w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v ?? "cost"); setPage(1); }}>
            <SelectTrigger className="h-8 w-36" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cost">Sort by cost</SelectItem>
              <SelectItem value="members">Sort by members</SelectItem>
              <SelectItem value="created">Sort by created</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Members
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Corpora
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Tokens
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Cost
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-sm">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-muted-foreground ml-1 text-xs">({o.slug})</span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {o.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm">{o.member_count}</td>
                    <td className="px-4 py-2 text-sm">{o.corpus_count}</td>
                    <td className="px-4 py-2 font-mono text-sm">
                      {formatNumber(o.tokens_used_this_month ?? 0)}
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">
                      ${(parseFloat(o.cost_usd_this_month) ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {formatDate(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({total} orgs)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </Button>
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
      </div>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px] overflow-auto">
          <SheetHeader>
            <SheetTitle>Organisation Details</SheetTitle>
            <SheetDescription>
              {detail?.org?.name ?? "Loading..."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 mt-4 px-4 pb-4">
            {detailLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/20" />
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
                      <p className="text-sm text-muted-foreground">No members</p>
                    ) : (
                      detail.members.map((m) => (
                        <div
                          key={m.user_id}
                          className="rounded-lg border border-border p-2.5 text-sm"
                        >
                          <span className="font-medium">{m.email}</span>
                          <Badge variant="outline" className="text-[10px] ml-1.5">
                            {m.role}
                          </Badge>
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
                      <p className="text-sm text-muted-foreground">No usage</p>
                    ) : (
                      detail.usage_this_month.map((u) => {
                        const total = (u.input_tokens || 0) + (u.output_tokens || 0);
                        const maxTotal = Math.max(
                          ...detail.usage_this_month.map(
                            (x) => (x.input_tokens || 0) + (x.output_tokens || 0),
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
                  <AlertDialog open onOpenChange={(open) => !open && setPendingPlan(null)}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Change organisation plan?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will change <strong>{detail.org.name}</strong>&apos;s plan
                          from <strong>{detail.org.plan}</strong> to{" "}
                          <strong>{pendingPlan}</strong>. This may affect feature access
                          and billing for all members.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingPlan(null)}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            planMutate.mutate({ id: selectedId!, plan: pendingPlan });
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
