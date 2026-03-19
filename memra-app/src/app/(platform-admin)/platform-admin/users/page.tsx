"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
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

const PLAN_OPTIONS = [
  { value: "all", label: "All plans" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
];

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

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 50)));

  const activeCount = status === "active" ? total : "—";
  const disabledCount = status === "disabled" ? total : "—";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Users
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage platform users, view usage, and control access
          </p>
        </div>

        {/* StatCards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total Users" value={total} />
          <StatCard label="Active" value={activeCount} />
          <StatCard label="Disabled" value={disabledCount} />
          <StatCard label="New Today" value="—" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="bg-surface/40 border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 placeholder:text-muted-foreground/30"
          />
          <div className="flex items-center gap-1">
            {PLAN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setPlan(opt.value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${
                  plan === opt.value
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setStatus(opt.value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${
                  status === opt.value
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                }`}
              >
                {opt.label}
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
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground/50 py-4 text-center">
              No users found
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Email
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Orgs
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Plan
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Tokens
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Last Active
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Created
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className="border-t border-border/20 hover:bg-surface/30 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {u.email}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {u.org_count}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {u.plan ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono">
                      {formatNumber(u.tokens_used_this_month)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {timeAgo(u.last_active_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          u.disabled
                            ? "bg-destructive/20 text-destructive"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {u.disabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {u.disabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => enableMutate.mutate(u.id)}
                          disabled={enableMutate.isPending}
                          className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          Enable
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={disableMutate.isPending}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                              >
                                Disable
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Disable user?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will prevent{" "}
                                <strong>{u.email}</strong> from logging in or
                                using the platform. You can re-enable them
                                later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => disableMutate.mutate(u.id)}
                              >
                                Disable User
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2 justify-center py-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Prev
          </button>
          <span className="text-[11px] font-mono text-muted-foreground/50">
            Page {page} of {totalPages} ({total} users)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          >
            Next
          </button>
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
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>
              {detail?.user?.email ?? "Loading..."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 mt-4 px-4 pb-4">
            {detailLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-muted/20"
                  />
                ))}
              </div>
            ) : detail ? (
              <>
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-mono">{detail.user.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {detail.user.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-mono">
                      {formatDate(detail.user.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span
                      className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded mt-0.5 ${
                        detail.user.disabled
                          ? "bg-destructive/20 text-destructive"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {detail.user.disabled ? "Disabled" : "Active"}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Org Memberships
                  </p>
                  <div className="space-y-1.5">
                    {detail.memberships.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No memberships
                      </p>
                    ) : (
                      detail.memberships.map((m) => (
                        <div
                          key={m.org_id}
                          className="rounded-lg border border-border p-2.5 text-sm"
                        >
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted-foreground ml-1">
                            ({m.slug})
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 ml-1.5">
                            {m.plan}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 ml-1">
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
                          <div key={u.call_type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono">{u.call_type}</span>
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

                <div className="pt-2">
                  {detail.user.disabled ? (
                    <Button
                      className="w-full"
                      onClick={() => enableMutate.mutate(selectedId!)}
                      disabled={enableMutate.isPending}
                    >
                      Enable User
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="destructive"
                            className="w-full"
                            disabled={disableMutate.isPending}
                          >
                            Disable User
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Disable user?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will prevent{" "}
                            <strong>{detail.user.email}</strong> from logging in
                            or using the platform. You can re-enable them
                            later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => disableMutate.mutate(selectedId!)}
                          >
                            Disable User
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
