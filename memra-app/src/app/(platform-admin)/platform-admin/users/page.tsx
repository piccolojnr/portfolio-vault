"use client";

import { useState, useCallback } from "react";
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
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage platform users, view usage, and control access
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            placeholder="Search by email..."
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
          <Select value={status} onValueChange={(v) => { setStatus(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="h-8 w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
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
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Orgs
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Tokens
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Last Active
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-sm">{u.email}</td>
                    <td className="px-4 py-2 text-sm">{u.org_count}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {u.plan ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">
                      {formatNumber(u.tokens_used_this_month)}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {timeAgo(u.last_active_at)}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={u.disabled ? "destructive" : "default"}
                        className="text-[10px]"
                      >
                        {u.disabled ? "Disabled" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      {u.disabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleEnable(e, u.id)}
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
                                onClick={(e) => e.stopPropagation()}
                                disabled={disableMutate.isPending}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                              >
                                Disable
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Disable user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will prevent <strong>{u.email}</strong> from logging in
                                or using the platform. You can re-enable them later.
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

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({total} users)
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
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>
              {detail?.user?.email ?? "Loading..."}
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
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm">{detail.user.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {detail.user.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{formatDate(detail.user.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={detail.user.disabled ? "destructive" : "default"} className="text-[10px] mt-0.5">
                      {detail.user.disabled ? "Disabled" : "Active"}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-2">
                    Org Memberships
                  </p>
                  <div className="space-y-1.5">
                    {detail.memberships.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No memberships</p>
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
                          <Badge variant="secondary" className="text-[10px] ml-1.5">
                            {m.plan}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] ml-1">
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
                          <AlertDialogTitle>Disable user?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will prevent <strong>{detail.user.email}</strong> from
                            logging in or using the platform. You can re-enable them later.
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
