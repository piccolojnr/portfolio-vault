"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/network/api";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BillingResponse = {
  plan: string;
  plan_source: string;
  subscription_status: string | null;
  period: {
    current_period_start: string | null;
    current_period_end: string | null;
  };
  usage: {
    tokens_used: number;
    monthly_token_limit: number | null;
  };
  limits: {
    documents: { used: number; max: number | null };
    corpora: { used: number; max: number | null };
    members: { used: number; max: number | null };
  };
  policy?: {
    documents?: {
      existing_documents_access?: string;
      new_document_uploads?: string;
      reingest_existing_documents?: string;
      over_limit?: boolean;
    };
    tokens?: {
      model?: string;
      reset_strategy?: string;
      window_source?: string;
    };
  };
  next_billing_date: string | null;
};

type HistoryRow = {
  id: string;
  paystack_event: string;
  paystack_reference: string;
  processed: boolean;
  error: string | null;
  created_at: string | null;
};

type HistoryResponse = {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: HistoryRow[];
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeSubStatus(status: string | null | undefined): string {
  return (status ?? "").toLowerCase().trim();
}

function formatEventLabel(value: string): string {
  const key = value.toLowerCase().trim();
  const labels: Record<string, string> = {
    "charge.success": "Payment received",
    "invoice.payment_failed": "Payment failed",
    "invoice.update": "Invoice updated",
    "subscription.create": "Subscription started",
    "subscription.not_renew": "Auto-renew disabled",
    "subscription.disable": "Subscription cancelled",
    "subscription.enable": "Subscription resumed",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/[._]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, org, refresh } = useAuth();

  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyMeta, setHistoryMeta] = useState<{ total: number; page: number; pages: number } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false);
  const [enterpriseRequest, setEnterpriseRequest] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    message: "",
  });
  const [enterpriseLoading, setEnterpriseLoading] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [enterpriseSuccess, setEnterpriseSuccess] = useState<string | null>(null);

  const success = searchParams.get("payment") === "success";

  const meter = useMemo(() => {
    if (!billing) return null;
    const limit = billing.usage.monthly_token_limit;
    const used = billing.usage.tokens_used;
    if (!limit) return { pct: 0, used, limit: null as number | null };
    const pct = Math.min(100, (used / limit) * 100);
    return { pct, used, limit };
  }, [billing]);

  const loadBilling = useCallback(async (page = historyPage) => {
    if (!org?.id) return;
    setLoading(true);
    setCancelError(null);
    try {
      const [b, h] = await Promise.all([
        apiFetch<BillingResponse>("/api/billing"),
        apiFetch<HistoryResponse>(`/api/billing/history?page=${page}&per_page=10`),
      ]);
      setBilling(b);
      setHistory(h.items);
      setHistoryMeta({ total: h.total, page: h.page, pages: h.pages });
    } catch {
      setBilling(null);
      setHistory([]);
      setHistoryMeta(null);
    } finally {
      setLoading(false);
    }
  }, [org?.id, historyPage]);

  useEffect(() => {
    void loadBilling(historyPage);
  }, [loadBilling, historyPage]);

  useEffect(() => {
    if (success) void refresh();
  }, [success, refresh]);

  const isOwner = org?.role === "owner";
  const subStatus = normalizeSubStatus(billing?.subscription_status);
  const isPaidPlan = !!billing && billing.plan !== "free";
  const isSelfService = billing?.plan_source === "self_service";

  const canShowCancelButton =
    isOwner &&
    isPaidPlan &&
    isSelfService &&
    subStatus !== "cancelled" &&
    subStatus !== "non_renewing";

  const subscriptionStatusNote = useMemo(() => {
    if (!billing || billing.plan === "free") return null;
    if (subStatus === "non_renewing") {
      return `Your subscription is set to end. You keep access until ${formatDate(billing.period.current_period_end ?? billing.next_billing_date)}.`;
    }
    if (subStatus === "cancelled") {
      return "This subscription is no longer active.";
    }
    if (subStatus === "attention") {
      return "Payment failed or needs attention. Update your payment method from the app banner or contact support.";
    }
    return null;
  }, [billing, subStatus]);

  async function onUpgradePro() {
    const res = await apiFetch<{ authorization_url: string }>(
      "/api/billing/subscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      },
    );

    // Paystack redirect
    window.location.href = res.authorization_url;
  }

  function openEnterpriseDialog() {
    setEnterpriseError(null);
    setEnterpriseSuccess(null);
    setEnterpriseRequest((prev) => ({
      ...prev,
      name: prev.name || user?.display_name || "",
      email: prev.email || user?.email || "",
      company: prev.company || org?.name || "",
    }));
    setEnterpriseDialogOpen(true);
  }

  async function onSubmitEnterpriseRequest() {
    setEnterpriseLoading(true);
    setEnterpriseError(null);
    try {
      const res = await apiFetch<{ status: string }>("/api/billing/enterprise-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: enterpriseRequest.name,
          email: enterpriseRequest.email,
          company: enterpriseRequest.company,
          team_size: enterpriseRequest.teamSize,
          message: enterpriseRequest.message,
        }),
      });
      if (res.status === "request_sent") {
        setEnterpriseDialogOpen(false);
        setEnterpriseSuccess(
          "Enterprise request sent. We have emailed confirmation and our sales team will contact you shortly.",
        );
        setEnterpriseRequest({
          name: "",
          email: "",
          company: "",
          teamSize: "",
          message: "",
        });
      } else {
        setEnterpriseError("Could not submit request right now. Please try again.");
      }
    } catch {
      setEnterpriseError("Could not submit request right now. Please try again.");
    } finally {
      setEnterpriseLoading(false);
    }
  }

  async function runCancel() {
    setCancelLoading(true);
    setCancelError(null);
    setCancelSuccess(null);
    try {
      const res = await apiFetch<{ status: string }>("/api/billing/cancel", {
        method: "POST",
      });
      if (res.status === "no_subscription") {
        setCancelSuccess(
          "We could not locate a cancellable subscription right now. Please try again shortly.",
        );
      } else if (res.status === "cancel_pending_manual") {
        setCancelSuccess(
          "Cancellation is being prepared. If it does not update soon, please contact support.",
        );
      } else if (res.status === "already_inactive") {
        setCancelSuccess(
          "That subscription was already cancelled with the payment provider. Refreshing your billing status…",
        );
      } else {
        setCancelSuccess(
          "Cancellation request sent. Status will update after payment provider confirmation.",
        );
      }
      await refresh();
      await loadBilling();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cancellation failed";
      if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
        setCancelError("Only the organisation owner can cancel the subscription.");
      } else {
        setCancelError(
          "Could not cancel the subscription right now. Please try again.",
        );
      }
    } finally {
      setCancelLoading(false);
    }
  }

  async function onReactivate() {
    const plan = (billing?.plan ?? "pro") as "pro" | "enterprise";
    const res = await apiFetch<{ authorization_url: string }>("/api/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    window.location.href = res.authorization_url;
  }

  async function onCancel() {
    setCancelDialogOpen(false);
    const ok = window.confirm(
      "Final confirmation: continue with cancellation?",
    );
    if (!ok) return;
    await runCancel();
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Billing</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Manage your plan, billing status, and payment history.
            </p>
            {success ? (
              <p className="mt-2 text-[11px] font-mono text-emerald-400">
                Payment successful. Your subscription will be activated shortly.
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Current Plan" value={billing?.plan ?? "free"} />
                <StatCard label="Subscription" value={billing?.subscription_status ?? "free"} />
                <StatCard
                  label="Current Period End"
                  value={formatDate(billing?.period.current_period_end ?? null)}
                />
              </div>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <SectionHeading>Subscription</SectionHeading>
                {subscriptionStatusNote ? (
                  <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
                    {subscriptionStatusNote}
                  </p>
                ) : null}
                {cancelSuccess ? (
                  <p className="text-[12px] font-mono text-emerald-400 mb-3">{cancelSuccess}</p>
                ) : null}
                {cancelError ? (
                  <p className="text-[12px] font-mono text-destructive mb-3">{cancelError}</p>
                ) : null}
                {enterpriseSuccess ? (
                  <p className="text-[12px] font-mono text-emerald-400 mb-3">{enterpriseSuccess}</p>
                ) : null}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-[12px] font-mono text-muted-foreground">
                    Manage your current subscription settings.
                  </div>
                  {billing?.plan === "free" ? (
                    isOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => void onUpgradePro()} className="h-8 px-3 text-[11px] font-mono">
                          upgrade to pro
                        </Button>
                        <Button
                          variant="outline"
                          onClick={openEnterpriseDialog}
                          className="h-8 px-3 text-[11px] font-mono"
                        >
                          request enterprise
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-muted-foreground max-w-md text-right sm:text-left">
                        Only the organisation owner can start a subscription.
                      </p>
                    )
                  ) : isPaidPlan && !isSelfService ? (
                    <p className="text-[11px] font-mono text-muted-foreground max-w-md text-right sm:text-left">
                      This plan is not managed through self-service billing. Contact your administrator to change or cancel.
                    </p>
                  ) : isPaidPlan && !isOwner ? (
                    <p className="text-[11px] font-mono text-muted-foreground max-w-md text-right sm:text-left">
                      Only the organisation owner can cancel or change the subscription.
                    </p>
                  ) : canShowCancelButton ? (
                    <Button
                      variant="outline"
                      onClick={() => setCancelDialogOpen(true)}
                      disabled={cancelLoading}
                      className="h-8 px-3 text-[11px] font-mono"
                    >
                      {cancelLoading ? "cancelling…" : "cancel subscription"}
                    </Button>
                  ) : isOwner && isSelfService && isPaidPlan && (subStatus === "non_renewing" || subStatus === "cancelled") ? (
                    <Button
                      onClick={() => void onReactivate()}
                      className="h-8 px-3 text-[11px] font-mono"
                    >
                      reactivate
                    </Button>
                  ) : isOwner && isSelfService && isPaidPlan && !subscriptionStatusNote ? (
                    <p className="text-[11px] font-mono text-muted-foreground max-w-md text-right sm:text-left">
                      No cancel action available for this subscription state.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <SectionHeading>Usage & Limits</SectionHeading>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[12px] font-mono">
                    <span className="text-muted-foreground">monthly tokens</span>
                    <span className="text-foreground">
                      {billing?.usage.monthly_token_limit == null
                        ? "unlimited"
                        : `${billing?.usage.tokens_used.toLocaleString()} / ${billing?.usage.monthly_token_limit.toLocaleString()}`}
                    </span>
                  </div>
                  {meter && meter.limit ? (
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${meter.pct}%` }} />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">documents</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.documents.max == null
                          ? "unlimited"
                          : `${billing?.limits.documents.used} / ${billing?.limits.documents.max}`}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">corpora</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.corpora.max == null
                          ? "unlimited"
                          : `${billing?.limits.corpora.used} / ${billing?.limits.corpora.max}`}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">members</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.members.max == null
                          ? "unlimited"
                          : `${billing?.limits.members.used} / ${billing?.limits.members.max}`}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                      policy
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      Token usage is calculated as a rolling sum of AI call tokens within the active billing window.
                      Resets happen when the window changes, not by clearing counters.
                    </p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      Document limits are fixed by plan. If you are over your current limit, existing documents remain
                      accessible, but new uploads are blocked until you upgrade or reduce document count.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
                  <h2 className="text-[13px] font-semibold text-foreground font-mono">Payment history</h2>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {historyMeta ? `${historyMeta.total} total` : `${history.length} activities`}
                  </span>
                </div>

                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted/10 border-b border-border/40">
                      <tr>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Activity
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Date
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-[12px] font-mono text-muted-foreground">
                            No history yet.
                          </td>
                        </tr>
                      ) : (
                        history.map((r) => (
                          <tr key={r.id} className="border-t border-border/20">
                            <td className="px-3 py-2.5 text-[12px]">
                              <div className="font-medium text-foreground">
                                {formatEventLabel(r.paystack_event)}
                              </div>
                              <div className="font-mono text-[10px] text-muted-foreground/70">
                                ref {r.paystack_reference.slice(0, 10)}…
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                              {formatDate(r.created_at)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${r.error
                                    ? "bg-destructive/20 text-destructive"
                                    : r.processed
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : "bg-amber-500/20 text-amber-400"
                                }`}
                              >
                                {r.error ? "needs review" : r.processed ? "completed" : "pending"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {historyMeta && historyMeta.pages > 1 ? (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      page {historyMeta.page} of {historyMeta.pages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] font-mono"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        prev
                      </Button>
                      <Button
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] font-mono"
                        disabled={historyPage >= historyMeta.pages}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This stops future auto-renewals. You usually keep access until your
            current period ends.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCancelDialogOpen(false)}
            >
              Keep subscription
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onCancel()}
              disabled={cancelLoading}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={enterpriseDialogOpen} onOpenChange={setEnterpriseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enterprise request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enterprise is sales-assisted. Share your details and we will contact you.
          </p>
          <div className="space-y-3">
            <input
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              placeholder="Full name"
              value={enterpriseRequest.name}
              onChange={(e) =>
                setEnterpriseRequest((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <input
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              placeholder="Work email"
              type="email"
              value={enterpriseRequest.email}
              onChange={(e) =>
                setEnterpriseRequest((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <input
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              placeholder="Company"
              value={enterpriseRequest.company}
              onChange={(e) =>
                setEnterpriseRequest((prev) => ({ ...prev, company: e.target.value }))
              }
            />
            <input
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              placeholder="Team size (optional)"
              value={enterpriseRequest.teamSize}
              onChange={(e) =>
                setEnterpriseRequest((prev) => ({ ...prev, teamSize: e.target.value }))
              }
            />
            <textarea
              className="w-full min-h-[100px] rounded-md border border-border bg-surface px-3 py-2 text-sm"
              placeholder="Tell us your requirements (security, SSO, compliance, scale...)"
              value={enterpriseRequest.message}
              onChange={(e) =>
                setEnterpriseRequest((prev) => ({ ...prev, message: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEnterpriseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onSubmitEnterpriseRequest}
              disabled={!enterpriseRequest.email || enterpriseLoading}
            >
              {enterpriseLoading ? "Sending..." : "Send request"}
            </Button>
          </div>
          {enterpriseError ? (
            <p className="text-[12px] font-mono text-destructive">{enterpriseError}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

